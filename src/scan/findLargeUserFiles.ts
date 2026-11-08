import { basename } from 'node:path';
import type { ArtifactRulesByName, ProjectArtifactRule } from '../catalog/projectArtifactRules.js';
import {
  findArtifactRulesOfName,
  findMarkedArtifactRule,
  groupArtifactRulesByName,
} from '../catalog/projectArtifactRules.js';
import type { PathRules } from '../path/pathRules.js';
import type { EntryReads } from '../system/entryReads.js';
import type { EntryStats } from '../system/loadEntryStats.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { loadPlacedFileIdentity } from '../system/loadPlacedFileIdentity.js';
import type {
  EvictedEntryRecorder,
  TreeEntry,
  TreeEntryVisit,
} from '../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { ScanIssue } from './issue.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';

export type UserFileFinding = {
  path: string;
  identity: FileIdentity;
  /** What deleting the file frees, as `loadPathMeasurement` counts it. */
  allocatedBytes: number;
  /** 1 when the file's private size could not be read, so its allocated blocks count instead. */
  privateSizeFallbackCount: number;
  modifiedMs: number;
};

type LargeFile = { path: string; stats: EntryStats };

/**
 * A folder name ending in an extension, such as `iMovie Library.imovielibrary` or
 * `Windows.vmwarevm`. macOS shows many such folders as one document, and only Launch Services
 * tells which, so every one counts as a package: a large file inside it belongs to the package.
 */
const PACKAGE_DIRECTORY_NAME_PATTERN = /\.[A-Za-z][A-Za-z0-9-]*$/;

/** A plain folder that Finder shows with a translated name, such as `Virtual Machines.localized`. */
const LOCALIZED_DIRECTORY_SUFFIX = '.localized';

/** A folder holding this entry is a git working tree; its files belong to a project. */
const PROJECT_MARKER_NAME = '.git';

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Walks each root on its own volume without following a link of any kind, and without entering
 * hidden folders, package folders (any folder named with an extension), git working trees, or a
 * project's artifact folder beside its marker, such as `build` beside `build.gradle`, its names
 * compared as `pathRules` compare them.
 * Each file is its own offer, measured as `loadPathMeasurement` measures one: a file whose blocks
 * a clone shares counts less, and a file with another hard link counts nothing, since deleting
 * one link frees nothing. A passed deadline ends the walk with one walkStopped issue. Findings
 * come sorted by path.
 */
export async function findLargeUserFiles(params: {
  pathRules: PathRules;
  rootDirs: string[];
  /** The artifacts whose files belong to their project, each judged by its marker. */
  artifactRules: ProjectArtifactRule[];
  minAllocatedBytes: number;
  deadlineMs: number;
  entryReads: EntryReads;
  recordEvictedEntry: EvictedEntryRecorder;
  privacyDenialCode: string | null;
}): Promise<{ findings: UserFileFinding[]; issues: ScanIssue[] }> {
  const artifactRulesByName = groupArtifactRulesByName({
    pathRules: params.pathRules,
    rules: params.artifactRules,
  });
  const largeFiles: LargeFile[] = [];
  const issues: ScanIssue[] = [];
  // Keys `dev:ino` of the files already collected, so a file met twice is measured once.
  const foundFileKeys = new Set<string>();

  // A file's private size never exceeds its allocated blocks, so a smaller one cannot qualify.
  function collectLargeFile(largeFile: LargeFile): void {
    const fileKey = `${largeFile.stats.dev}:${largeFile.stats.ino}`;

    if (largeFile.stats.allocatedBytes < params.minAllocatedBytes || foundFileKeys.has(fileKey)) {
      return;
    }

    foundFileKeys.add(fileKey);
    largeFiles.push(largeFile);
  }

  for (const rootDir of params.rootDirs) {
    const rootStats = await loadEntryStats({ path: rootDir });

    if (rootStats.kind === 'failed') {
      issues.push(
        ...buildFailureIssues({
          path: rootDir,
          failure: rootStats.failure,
          privacyDenialCode: params.privacyDenialCode,
        }),
      );

      continue;
    }

    if (rootStats.value.kind === 'file') {
      collectLargeFile({ path: rootDir, stats: rootStats.value });

      continue;
    }

    if (rootStats.value.kind !== 'directory' || !isUserFolderName({ name: basename(rootDir) })) {
      continue;
    }

    const rootDev = rootStats.value.dev;
    const walkEnd = await walkDirectoryTree({
      rootPath: rootDir,
      isStatsNeeded: true,
      maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
      isStopped: () => Date.now() >= params.deadlineMs,
      entryReads: params.entryReads,
      visitEntry: (entry): TreeEntryVisit => {
        if (
          entry.stats === null ||
          entry.stats.dev !== rootDev ||
          entry.siblingNames.has(PROJECT_MARKER_NAME)
        ) {
          return 'skip';
        }

        if (entry.kind === 'file') {
          collectLargeFile({ path: entry.path, stats: entry.stats });

          return 'skip';
        }

        if (
          entry.kind === 'directory' &&
          isUserFolderName({ name: entry.name }) &&
          !isMarkedArtifactFolder({
            pathRules: params.pathRules,
            artifactRulesByName: artifactRulesByName,
            entry: entry,
          })
        ) {
          return 'descend';
        }

        return 'skip';
      },
      onUnreadable: (unreadable) => {
        issues.push(
          ...buildFailureIssues({
            path: unreadable.path,
            failure: unreadable.failure,
            privacyDenialCode: params.privacyDenialCode,
          }),
        );
      },
      onEvictedEntrySkipped: params.recordEvictedEntry,
    });

    if (walkEnd === 'stopped') {
      issues.push({ path: rootDir, reason: 'walkStopped', detail: 'deadline' });

      break;
    }
  }

  const findings = await loadUserFileFindings({
    largeFiles: largeFiles,
    minAllocatedBytes: params.minAllocatedBytes,
    deadlineMs: params.deadlineMs,
    entryReads: params.entryReads,
    recordEvictedEntry: params.recordEvictedEntry,
    issues: issues,
    privacyDenialCode: params.privacyDenialCode,
  });

  return {
    findings: findings.toSorted((left, right) => (left.path < right.path ? -1 : 1)),
    issues: issues,
  };
}

/**
 * Each large file whose measurement still reaches the minimum, with its identity as `entryReads`
 * place it, so a root that is a link of any kind has the kind of a symbolic link.
 */
async function loadUserFileFindings(params: {
  largeFiles: LargeFile[];
  minAllocatedBytes: number;
  deadlineMs: number;
  entryReads: EntryReads;
  recordEvictedEntry: EvictedEntryRecorder;
  issues: ScanIssue[];
  privacyDenialCode: string | null;
}): Promise<UserFileFinding[]> {
  const findings = await Promise.all(
    params.largeFiles.map(async (largeFile): Promise<UserFileFinding | null> => {
      const identityResult = await loadPlacedFileIdentity({
        path: largeFile.path,
        entryReads: params.entryReads,
      });

      if (identityResult.kind === 'failed') {
        params.issues.push(
          ...buildFailureIssues({
            path: largeFile.path,
            failure: identityResult.failure,
            privacyDenialCode: params.privacyDenialCode,
          }),
        );

        return null;
      }

      const measured = await loadPathMeasurement({
        paths: [largeFile.path],
        deadlineMs: params.deadlineMs,
        entryReads: params.entryReads,
        recordEvictedEntry: params.recordEvictedEntry,
      });

      if (
        measured.latestModifiedMs === null ||
        measured.allocatedBytes < params.minAllocatedBytes
      ) {
        return null;
      }

      return {
        path: largeFile.path,
        identity: identityResult.value,
        allocatedBytes: measured.allocatedBytes,
        privateSizeFallbackCount: measured.privateSizeFallbackCount,
        modifiedMs: measured.latestModifiedMs,
      };
    }),
  );

  return findings.filter((finding) => finding !== null);
}

/** Whether the folder is a project's artifact by a rule of its name and a marker beside it. */
function isMarkedArtifactFolder(params: {
  pathRules: PathRules;
  artifactRulesByName: ArtifactRulesByName;
  entry: TreeEntry;
}): boolean {
  const nameRules = findArtifactRulesOfName({
    pathRules: params.pathRules,
    rulesByName: params.artifactRulesByName,
    name: params.entry.name,
  });

  if (nameRules === null) {
    return false;
  }

  return (
    findMarkedArtifactRule({
      pathRules: params.pathRules,
      nameRules: nameRules,
      projectEntryNames: params.entry.siblingNames,
    }) !== null
  );
}

function isUserFolderName(params: { name: string }): boolean {
  if (params.name.startsWith('.')) {
    return false;
  }

  if (params.name.toLowerCase().endsWith(LOCALIZED_DIRECTORY_SUFFIX)) {
    return true;
  }

  return !PACKAGE_DIRECTORY_NAME_PATTERN.test(params.name);
}
