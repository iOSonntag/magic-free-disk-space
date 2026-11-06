import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
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

export type CatalogEntryTargets = {
  targets: CatalogTarget[];
  issues: ScanIssue[];
};

/**
 * Lists the items each entry covers, as its selection says. A missing path, or a children path
 * that is not a folder, adds nothing; an unreadable path adds an issue.
 */
export async function findCatalogTargets(params: {
  environment: Environment;
  entries: CatalogEntry[];
  privacyDenialCode: string | null;
}): Promise<{ targets: CatalogTarget[]; issues: ScanIssue[] }> {
  const targetsPerEntry: CatalogEntryTargets[] = [];

  for (const entry of params.entries) {
    const path = getCatalogEntryPath({ environment: params.environment, entry: entry });
    const entryPath = { entry: entry, path: path, privacyDenialCode: params.privacyDenialCode };

    switch (entry.selection.kind) {
      case 'path':
        targetsPerEntry.push(await findSelfTargets(entryPath));
        break;
      case 'children':
        targetsPerEntry.push(await findChildTargets(entryPath));
        break;
      case 'profileFolders':
        targetsPerEntry.push(
          await findProfileFolderTargets({ ...entryPath, selection: entry.selection }),
        );
        break;
    }
  }

  return {
    targets: targetsPerEntry.flatMap((entryTargets) => entryTargets.targets),
    issues: targetsPerEntry.flatMap((entryTargets) => entryTargets.issues),
  };
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
      issues: buildFailureIssues({
        path: params.path,
        failure: identityResult.failure,
        privacyDenialCode: params.privacyDenialCode,
      }),
    };
  }

  return {
    targets: [{ entry: params.entry, path: params.path, targetPaths: [params.path] }],
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
    issues: [],
  };
}
