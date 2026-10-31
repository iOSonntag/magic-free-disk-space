import { dirname } from 'node:path';
import type { ProjectArtifactRule } from '../catalog/projectArtifactRules.js';
import type { ProjectPinFileRef } from '../explore/projectPins/projectPins.js';
import { matchProjectPinFile } from '../explore/projectPins/projectPins.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
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
  /** False when the walk stopped at its deadline, or could not read or skipped an evicted folder. */
  isComplete: boolean;
  issues: ScanIssue[];
};

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Walks the projects under `homeDir` once: the artifact folders whose project folder holds a
 * marker file, and the pin files it passes. Symbolic links are never followed; a passed
 * `deadlineMs` stops the walk with one `walkStopped` issue. Never rejects.
 */
export async function walkProjects(params: {
  homeDir: AbsolutePath;
  excludedTopNames: string[];
  rules: ProjectArtifactRule[];
  maxDepth: number;
  deadlineMs: number;
  isFolderEvicted: (folder: { path: string }) => boolean;
}): Promise<ProjectWalk> {
  const artifactNames = new Set(params.rules.map((rule) => rule.artifactName));
  const artifacts: ArtifactFinding[] = [];
  const pinFiles: ProjectPinFileRef[] = [];
  const issues: ScanIssue[] = [];
  let hasUnreadableFolder = false;
  let hasEvictedFolder = false;

  function visitProjectEntry(entry: TreeEntry): TreeEntryVisit {
    if (entry.kind === 'file' || entry.kind === 'symbolicLink') {
      const pinFile = findWalkedPinFile({ entry: entry });

      if (pinFile !== null) {
        pinFiles.push(pinFile);
      }

      return 'skip';
    }

    // Only real folders count: a symbolic link is never followed.
    if (entry.kind !== 'directory') {
      return 'skip';
    }

    if (entry.depth === 1 && params.excludedTopNames.includes(entry.name)) {
      return 'skip';
    }

    if (artifactNames.has(entry.name)) {
      const markedRule = params.rules.find(
        (rule) =>
          rule.artifactName === entry.name &&
          rule.markerNames.some((markerName) => entry.siblingNames.has(markerName)),
      );

      if (markedRule !== undefined) {
        artifacts.push({
          artifactPath: entry.path,
          projectRoot: dirname(entry.path),
          rule: markedRule,
        });
      }

      return 'skip';
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
    isFolderEvicted: params.isFolderEvicted,
    visitEntry: visitProjectEntry,
    onUnreadable: (unreadable) => {
      const readIssues = buildFailureIssues({ path: unreadable.path, failure: unreadable.failure });

      if (readIssues.length > 0) {
        hasUnreadableFolder = true;
      }

      issues.push(...readIssues);
    },
    // An evicted folder is no read failure, yet the pin files below it stay unknown.
    onEvictedFolderSkipped: () => {
      hasEvictedFolder = true;
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
    isComplete: walkEnd === 'completed' && !hasUnreadableFolder && !hasEvictedFolder,
    issues: issues,
  };
}

/** The ref of a file or link the walk passed, or `null` when its name is no pin file's. */
function findWalkedPinFile(params: { entry: TreeEntry }): ProjectPinFileRef | null {
  const kind = matchProjectPinFile({
    name: params.entry.name,
    siblingNames: params.entry.siblingNames,
    source: 'walk',
  });

  if (kind === null) {
    return null;
  }

  const path = parseAbsolutePath({ text: params.entry.path });

  // Every entry lies below the absolute home folder the walk started at.
  if (path.kind === 'failed') {
    throw new Error('An entry of the project walk has no absolute path.');
  }

  return { path: path.value, kind: kind };
}
