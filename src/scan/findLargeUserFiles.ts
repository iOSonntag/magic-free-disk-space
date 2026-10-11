import { basename } from 'node:path';
import type { DirectoryFailure } from '../system/loadDirectoryNames.js';
import type { EntryStats } from '../system/loadEntryStats.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileFailure, FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import type { TreeEntryVisit } from '../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import type { ScanIssue } from './issue.js';

export type UserFileFinding = {
  path: string;
  identity: FileIdentity;
  allocatedBytes: number;
  modifiedMs: number;
};

type LargeFile = { path: string; stats: EntryStats };

/** Folders that macOS shows as one document or that belong to an app, never loose files. */
const PACKAGE_DIRECTORY_SUFFIXES = [
  '.app',
  '.photoslibrary',
  '.musiclibrary',
  '.fcpbundle',
  '.logicx',
  '.band',
  '.sparsebundle',
  '.xcodeproj',
  '.xcworkspace',
  '.framework',
  '.xcframework',
  '.bundle',
  '.plugin',
  '.component',
  '.vst',
  '.vst3',
  '.aaxplugin',
  '.kext',
];

/** A folder holding this entry is a git working tree; its files belong to a project. */
const PROJECT_MARKER_NAME = '.git';

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Walks each root on its own volume without following symbolic links, and without entering
 * hidden folders, package folders such as `.app`, or git working trees. A passed deadline ends
 * the walk with one walkStopped issue. Findings come sorted by path.
 */
export async function findLargeUserFiles(params: {
  rootDirs: string[];
  minAllocatedBytes: number;
  deadlineMs: number;
}): Promise<{ findings: UserFileFinding[]; issues: ScanIssue[] }> {
  const largeFiles: LargeFile[] = [];
  const issues: ScanIssue[] = [];
  // Keys `dev:ino` of the files already found, so a hard link is reported once.
  const foundFileKeys = new Set<string>();

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
      issues.push(...buildFailureIssues({ path: rootDir, failure: rootStats.failure }));

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

        if (entry.kind === 'directory' && isUserFolderName({ name: entry.name })) {
          return 'descend';
        }

        return 'skip';
      },
      onUnreadable: (unreadable) => {
        issues.push(...buildFailureIssues({ path: unreadable.path, failure: unreadable.failure }));
      },
    });

    if (walkEnd === 'stopped') {
      issues.push({ path: rootDir, reason: 'walkStopped', detail: 'deadline' });

      break;
    }
  }

  const findings = await loadUserFileFindings({ largeFiles: largeFiles, issues: issues });

  return {
    findings: findings.toSorted((left, right) => (left.path < right.path ? -1 : 1)),
    issues: issues,
  };
}

async function loadUserFileFindings(params: {
  largeFiles: LargeFile[];
  issues: ScanIssue[];
}): Promise<UserFileFinding[]> {
  const findings = await Promise.all(
    params.largeFiles.map(async (largeFile): Promise<UserFileFinding | null> => {
      const identityResult = await loadFileIdentity({ path: largeFile.path });

      if (identityResult.kind === 'failed') {
        params.issues.push(
          ...buildFailureIssues({ path: largeFile.path, failure: identityResult.failure }),
        );

        return null;
      }

      return {
        path: largeFile.path,
        identity: identityResult.value,
        allocatedBytes: largeFile.stats.allocatedBytes,
        modifiedMs: largeFile.stats.modifiedMs,
      };
    }),
  );

  return findings.filter((finding) => finding !== null);
}

function isUserFolderName(params: { name: string }): boolean {
  if (params.name.startsWith('.')) {
    return false;
  }

  const lowerCaseName = params.name.toLowerCase();

  return !PACKAGE_DIRECTORY_SUFFIXES.some((suffix) => lowerCaseName.endsWith(suffix));
}

function buildFailureIssues(params: {
  path: string;
  failure: FileFailure | DirectoryFailure;
}): ScanIssue[] {
  if (params.failure.reason === 'permissionDenied' || params.failure.reason === 'unexpected') {
    return [{ path: params.path, reason: params.failure.reason, detail: params.failure.code }];
  }

  return [];
}
