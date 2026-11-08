import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { buildFailureIssues } from './buildReadIssue.js';
import { findProfileFolderTargets } from './findProfileFolderTargets.js';
import { getCatalogEntryPath } from './getCatalogEntryPath.js';
import type { ScanIssue } from './issue.js';

/** One item of an entry: its place, shown and judged, and the paths that go with it. */
export type CatalogTarget = {
  entry: CatalogEntry;
  path: string;
  /** The item's own path for a `path` or `children` entry; the existing subpaths of a profile. */
  targetPaths: [string, ...string[]];
};

/** The items of one entry, and whether its path was read, so it keeps its place. */
export type CatalogEntryTargets = {
  targets: CatalogTarget[];
  /** False when the entry's path could not be read, such as when it is missing. */
  isPathRead: boolean;
  issues: ScanIssue[];
};

/**
 * Lists the items each entry covers, as its selection says. A missing path, or a children path
 * that is not a folder, adds nothing; an unreadable path adds an issue. An entry whose path was
 * read keeps its place, even with no item of its own: a later item that would delete it overlaps.
 */
export async function findCatalogTargets(params: {
  environment: Environment;
  entries: CatalogEntry[];
  privacyDenialCode: string | null;
}): Promise<{
  targets: CatalogTarget[];
  /** The items none of which goes, since each would delete an earlier entry's path. */
  overlappingTargets: CatalogTarget[];
  issues: ScanIssue[];
}> {
  const targets: CatalogTarget[] = [];
  const overlappingTargets: CatalogTarget[] = [];
  const issues: ScanIssue[] = [];
  const earlierEntryPaths: string[] = [];

  for (const entry of params.entries) {
    const path = getCatalogEntryPath({ environment: params.environment, entry: entry });
    const entryTargets = await findEntryTargets({
      entry: entry,
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    for (const target of entryTargets.targets) {
      const isOverlapping = isDeletingEarlierEntryPath({
        pathRules: params.environment.pathRules,
        target: target,
        earlierEntryPaths: earlierEntryPaths,
      });

      if (isOverlapping) {
        overlappingTargets.push(target);
      } else {
        targets.push(target);
      }
    }

    issues.push(...entryTargets.issues);

    if (entryTargets.isPathRead) {
      earlierEntryPaths.push(path);
    }
  }

  return { targets: targets, overlappingTargets: overlappingTargets, issues: issues };
}

/**
 * Whether a target of the item equals or holds an earlier entry's path, so deleting it would take
 * what that entry keeps. An advice or an explore entry deletes nothing, so it overlaps none.
 */
function isDeletingEarlierEntryPath(params: {
  pathRules: PathRules;
  target: CatalogTarget;
  earlierEntryPaths: string[];
}): boolean {
  switch (params.target.entry.removal.kind) {
    case 'advice':
    case 'explore':
      return false;
    case 'delete':
      return params.target.targetPaths.some((targetPath) =>
        params.earlierEntryPaths.some((entryPath) =>
          isSameOrInsidePath({ rules: params.pathRules, path: entryPath, parentPath: targetPath }),
        ),
      );
  }
}

function findEntryTargets(params: {
  entry: CatalogEntry;
  path: string;
  privacyDenialCode: string | null;
}): Promise<CatalogEntryTargets> {
  switch (params.entry.selection.kind) {
    case 'path':
      return findSelfTargets(params);
    case 'children':
      return findChildTargets(params);
    case 'profileFolders':
      return findProfileFolderTargets({
        entry: params.entry,
        selection: params.entry.selection,
        path: params.path,
        privacyDenialCode: params.privacyDenialCode,
      });
  }
}

async function findSelfTargets(params: {
  entry: CatalogEntry;
  path: string;
  privacyDenialCode: string | null;
}): Promise<CatalogEntryTargets> {
  const identityResult = await loadFileIdentity({ path: params.path });

  if (identityResult.kind === 'failed') {
    return {
      targets: [],
      isPathRead: false,
      issues: buildFailureIssues({
        path: params.path,
        failure: identityResult.failure,
        privacyDenialCode: params.privacyDenialCode,
      }),
    };
  }

  return {
    targets: [{ entry: params.entry, path: params.path, targetPaths: [params.path] }],
    isPathRead: true,
    issues: [],
  };
}

async function findChildTargets(params: {
  entry: CatalogEntry;
  path: string;
  privacyDenialCode: string | null;
}): Promise<CatalogEntryTargets> {
  const namesResult = await loadDirectoryNames({ path: params.path });

  if (namesResult.kind === 'failed') {
    return {
      targets: [],
      isPathRead: false,
      issues: buildFailureIssues({
        path: params.path,
        failure: namesResult.failure,
        privacyDenialCode: params.privacyDenialCode,
      }),
    };
  }

  return {
    targets: namesResult.value.map((name) => {
      const childPath = join(params.path, name);

      return { entry: params.entry, path: childPath, targetPaths: [childPath] };
    }),
    isPathRead: true,
    issues: [],
  };
}
