import { basename, dirname } from 'node:path';
import type { ProjectArtifactRule, ProjectMarker } from '../catalog/projectArtifactRules.js';
import { findMarkedArtifactRule } from '../catalog/projectArtifactRules.js';
import type { ProjectPinFileRef } from '../explore/projectPins/projectPins.js';
import {
  matchProjectPinFile,
  matchProjectPinFileName,
} from '../explore/projectPins/projectPins.js';
import { isSameEntryName, toComparablePathText } from '../path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { EntryReads } from '../system/entryReads.js';
import type { TreeEntry, TreeEntryVisit } from '../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { ScanIssue } from './issue.js';

export type ArtifactFinding = {
  artifactPath: string;
  projectRoot: string;
  rule: ProjectArtifactRule;
};

export type ProjectWalk = {
  /** Sorted by path. */
  artifacts: ArtifactFinding[];
  pinFiles: ProjectPinFileRef[];
  /**
   * False when the walk stopped at its deadline, could not read a folder, or skipped an evicted
   * folder or an evicted entry named like a pin file.
   */
  isComplete: boolean;
  issues: ScanIssue[];
};

/** A rule of the catalog, and the same rule with its names in the form the platform compares. */
type ComparableArtifactRule = {
  catalogRule: ProjectArtifactRule;
  comparableRule: ProjectArtifactRule;
};

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Walks the projects under `homeDir` once: the artifact folders whose project folder holds a
 * marker file, and the pin files it passes. An artifact folder beside no marker is skipped or
 * walked as its rule says. Folder names and markers compare as the platform compares names, so
 * `Bin` beside `Foo.CSPROJ` counts on Windows. Symbolic links are never followed; a passed
 * `deadlineMs` stops the walk with one `walkStopped` issue. Never rejects.
 */
export async function walkProjects(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  excludedTopNames: string[];
  rules: ProjectArtifactRule[];
  maxDepth: number;
  deadlineMs: number;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
}): Promise<ProjectWalk> {
  const comparableRules = params.rules.map((rule) =>
    buildComparableArtifactRule({ pathRules: params.pathRules, rule: rule }),
  );
  const artifactNames = new Set(comparableRules.map((rule) => rule.comparableRule.artifactName));
  const artifacts: ArtifactFinding[] = [];
  const pinFiles: ProjectPinFileRef[] = [];
  const issues: ScanIssue[] = [];
  let hasUnreadableFolder = false;
  let hasEvictedPinSource = false;

  function visitProjectEntry(entry: TreeEntry): TreeEntryVisit {
    if (entry.kind === 'file' || entry.kind === 'symbolicLink') {
      const pinFile = findWalkedPinFile({ pathRules: params.pathRules, entry: entry });

      if (pinFile !== null) {
        pinFiles.push(pinFile);
      }

      return 'skip';
    }

    // Only real folders count: a symbolic link is never followed.
    if (entry.kind !== 'directory') {
      return 'skip';
    }

    // Compared as the platform compares names, so `appdata` is `AppData` on Windows.
    if (
      entry.depth === 1 &&
      params.excludedTopNames.some((name) =>
        isSameEntryName({ rules: params.pathRules, name: name, otherName: entry.name }),
      )
    ) {
      return 'skip';
    }

    const comparableName = toComparablePathText({ rules: params.pathRules, text: entry.name });

    if (artifactNames.has(comparableName)) {
      const comparableEntryNames = new Set(
        [...entry.siblingNames].map((name) =>
          toComparablePathText({ rules: params.pathRules, text: name }),
        ),
      );
      // Matched in the compared form, answered as the catalog names it, which its origin carries.
      const markedRule = comparableRules.find(
        (rule) =>
          findMarkedArtifactRule({
            rules: [rule.comparableRule],
            name: comparableName,
            projectEntryNames: comparableEntryNames,
          }) !== null,
      );

      if (markedRule !== undefined) {
        artifacts.push({
          artifactPath: entry.path,
          projectRoot: dirname(entry.path),
          rule: markedRule.catalogRule,
        });

        return 'skip';
      }

      // An unmarked folder one rule skips is no project to search either, such as `vendor`; any
      // other is an ordinary folder, such as a `bin` beside no project file of .NET.
      const skippedUnmarked = comparableRules.some(
        (rule) =>
          rule.comparableRule.artifactName === comparableName &&
          rule.catalogRule.unmarkedFolder === 'skipped',
      );

      if (skippedUnmarked) {
        return 'skip';
      }
    }

    if (entry.name.startsWith('.') || entry.depth >= params.maxDepth) {
      return 'skip';
    }

    return 'descend';
  }

  const walkEnd = await walkDirectoryTree({
    rootPath: params.homeDir,
    isStatsNeeded: false,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    entryReads: params.entryReads,
    visitEntry: visitProjectEntry,
    onUnreadable: (unreadable) => {
      const readIssues = buildFailureIssues({
        path: unreadable.path,
        failure: unreadable.failure,
        privacyDenialCode: params.privacyDenialCode,
      });

      if (readIssues.length > 0) {
        hasUnreadableFolder = true;
      }

      issues.push(...readIssues);
    },
    // An evicted entry is no read failure, yet a pin file below it or in it stays unknown.
    onEvictedEntrySkipped: (entry) => {
      if (
        entry.kind === 'directory' ||
        matchProjectPinFileName({ name: basename(entry.path), source: 'walk' }) !== null
      ) {
        hasEvictedPinSource = true;
      }
    },
  });

  if (walkEnd === 'stopped') {
    issues.push({ path: params.homeDir, reason: 'walkStopped', detail: 'deadline' });
  }

  return {
    artifacts: artifacts.toSorted((left, right) =>
      left.artifactPath < right.artifactPath ? -1 : 1,
    ),
    pinFiles: pinFiles,
    isComplete: walkEnd === 'completed' && !hasUnreadableFolder && !hasEvictedPinSource,
    issues: issues,
  };
}

function buildComparableArtifactRule(params: {
  pathRules: PathRules;
  rule: ProjectArtifactRule;
}): ComparableArtifactRule {
  return {
    catalogRule: params.rule,
    comparableRule: {
      ...params.rule,
      artifactName: toComparablePathText({
        rules: params.pathRules,
        text: params.rule.artifactName,
      }),
      markers: params.rule.markers.map((marker) =>
        toComparableMarker({ pathRules: params.pathRules, marker: marker }),
      ),
    },
  };
}

function toComparableMarker(params: {
  pathRules: PathRules;
  marker: ProjectMarker;
}): ProjectMarker {
  switch (params.marker.kind) {
    case 'fileName':
      return {
        kind: 'fileName',
        name: toComparablePathText({ rules: params.pathRules, text: params.marker.name }),
      };
    case 'fileSuffix':
      return {
        kind: 'fileSuffix',
        suffix: toComparablePathText({ rules: params.pathRules, text: params.marker.suffix }),
      };
  }
}

/** The ref of a file or link the walk passed, or `null` when its name is no pin file's. */
function findWalkedPinFile(params: {
  pathRules: PathRules;
  entry: TreeEntry;
}): ProjectPinFileRef | null {
  const kind = matchProjectPinFile({
    name: params.entry.name,
    siblingNames: params.entry.siblingNames,
    source: 'walk',
  });

  if (kind === null) {
    return null;
  }

  const path = parseAbsolutePath({ rules: params.pathRules, text: params.entry.path });

  // Every entry lies below the absolute home folder the walk started at.
  if (path.kind === 'failed') {
    throw new Error('An entry of the project walk has no absolute path.');
  }

  return { path: path.value, kind: kind };
}
