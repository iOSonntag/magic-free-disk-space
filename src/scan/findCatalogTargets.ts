import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { buildFailureIssues } from './buildReadIssue.js';
import { getCatalogEntryPath } from './getCatalogEntryPath.js';
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
  privacyDenialCode: string | null;
}): Promise<{ targets: CatalogTarget[]; issues: ScanIssue[] }> {
  const targetsPerEntry: CatalogEntryTargets[] = [];

  for (const entry of params.entries) {
    const path = getCatalogEntryPath({ environment: params.environment, entry: entry });
    const entryPath = { entry: entry, path: path, privacyDenialCode: params.privacyDenialCode };

    if (entry.scope === 'self') {
      targetsPerEntry.push(await findSelfTargets(entryPath));
    } else {
      targetsPerEntry.push(await findChildTargets(entryPath));
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
    targets: [{ entry: params.entry, path: params.path }],
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
    targets: namesResult.value.map((name) => ({
      entry: params.entry,
      path: join(params.path, name),
    })),
    issues: [],
  };
}
