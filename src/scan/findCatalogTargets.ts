import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { DirectoryFailure } from '../system/loadDirectoryNames.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import type { ScanIssue } from './issue.js';

export type CatalogTarget = {
  entry: CatalogEntry;
  path: string;
};

type CatalogEntryTargets = {
  targets: CatalogTarget[];
  issues: ScanIssue[];
};

/**
 * Lists the paths each entry covers. A missing path, or a children path that is not a folder,
 * adds nothing; an unreadable path adds an issue.
 */
export async function findCatalogTargets(params: {
  environment: Environment;
  entries: CatalogEntry[];
}): Promise<{ targets: CatalogTarget[]; issues: ScanIssue[] }> {
  const targetsPerEntry: CatalogEntryTargets[] = [];

  for (const entry of params.entries) {
    const path = getCatalogEntryPath({ environment: params.environment, entry: entry });

    if (entry.scope === 'self') {
      targetsPerEntry.push(await findSelfTargets({ entry: entry, path: path }));
    } else {
      targetsPerEntry.push(await findChildTargets({ entry: entry, path: path }));
    }
  }

  return {
    targets: targetsPerEntry.flatMap((entryTargets) => entryTargets.targets),
    issues: targetsPerEntry.flatMap((entryTargets) => entryTargets.issues),
  };
}

function getCatalogEntryPath(params: { environment: Environment; entry: CatalogEntry }): string {
  if (params.entry.root === 'absolute') {
    return params.entry.path;
  }

  const rootDir =
    params.entry.root === 'home' ? params.environment.homeDir : params.environment.tempDir;

  return join(rootDir, params.entry.path);
}

async function findSelfTargets(params: {
  entry: CatalogEntry;
  path: string;
}): Promise<CatalogEntryTargets> {
  const identityResult = await loadFileIdentity({ path: params.path });

  if (identityResult.kind === 'failed') {
    return {
      targets: [],
      issues: buildFailureIssues({ path: params.path, failure: identityResult.failure }),
    };
  }

  return {
    targets: [{ entry: params.entry, path: params.path }],
    issues: [],
  };
}

async function findChildTargets(params: {
  entry: CatalogEntry;
  path: string;
}): Promise<CatalogEntryTargets> {
  const namesResult = await loadDirectoryNames({ path: params.path });

  if (namesResult.kind === 'failed') {
    return {
      targets: [],
      issues: buildFailureIssues({ path: params.path, failure: namesResult.failure }),
    };
  }

  return {
    targets: namesResult.value.map((name) => ({
      entry: params.entry,
      path: join(params.path, name),
    })),
    issues: [],
  };
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
