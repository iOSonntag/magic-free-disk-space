import { join } from 'node:path';
import type { CatalogEntry, CatalogSelectionProfileFolders } from '../catalog/catalog.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { CatalogEntryTargets, CatalogTarget } from './findCatalogTargets.js';
import type { ScanIssue } from './issue.js';

/**
 * Lists one item per profile folder of `path`, a folder that holds the selection's `markerName`
 * (any folder for a `null` marker):
 * `path` itself, for a browser that keeps its one profile there, and each child folder. An item's
 * targets are the selection's `subpaths` that exist in its folder; the item of `path` also takes
 * the `rootSubpaths` that exist in it, marker or not. A folder with no target adds no item. A
 * missing path adds nothing; an unreadable one adds an issue.
 */
export async function findProfileFolderTargets(params: {
  entry: CatalogEntry;
  selection: CatalogSelectionProfileFolders;
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

  const targetsPerFolder: CatalogEntryTargets[] = [
    await findFolderTargets({
      entry: params.entry,
      selection: params.selection,
      folderPath: params.path,
      rootSubpaths: params.selection.rootSubpaths,
      privacyDenialCode: params.privacyDenialCode,
    }),
  ];

  for (const name of namesResult.value) {
    targetsPerFolder.push(
      await findFolderTargets({
        entry: params.entry,
        selection: params.selection,
        folderPath: join(params.path, name),
        rootSubpaths: [],
        privacyDenialCode: params.privacyDenialCode,
      }),
    );
  }

  return {
    targets: targetsPerFolder.flatMap((folderTargets) => folderTargets.targets),
    issues: targetsPerFolder.flatMap((folderTargets) => folderTargets.issues),
  };
}

/**
 * The one item of `folderPath`: its existing `rootSubpaths`, and its existing profile subpaths
 * when it holds the marker. None when no target exists.
 */
async function findFolderTargets(params: {
  entry: CatalogEntry;
  selection: CatalogSelectionProfileFolders;
  folderPath: string;
  rootSubpaths: string[];
  privacyDenialCode: string | null;
}): Promise<CatalogEntryTargets> {
  const root = await findExistingSubpaths({
    subpaths: params.rootSubpaths,
    folderPath: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });
  const profile = await findProfileSubpaths({
    selection: params.selection,
    folderPath: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });
  const issues = [...root.issues, ...profile.issues];
  const [firstTargetPath, ...otherTargetPaths] = [...root.paths, ...profile.paths];

  if (firstTargetPath === undefined) {
    return { targets: [], issues: issues };
  }

  const target: CatalogTarget = {
    entry: params.entry,
    path: params.folderPath,
    targetPaths: [firstTargetPath, ...otherTargetPaths],
  };

  return { targets: [target], issues: issues };
}

/**
 * The existing profile subpaths of `folderPath` when it holds the marker, or always for a `null`
 * marker; none otherwise.
 */
async function findProfileSubpaths(params: {
  selection: CatalogSelectionProfileFolders;
  folderPath: string;
  privacyDenialCode: string | null;
}): Promise<{ paths: string[]; issues: ScanIssue[] }> {
  if (params.selection.markerName !== null) {
    const markerPath = join(params.folderPath, params.selection.markerName);
    const markerResult = await loadFileIdentity({ path: markerPath });

    if (markerResult.kind === 'failed') {
      return {
        paths: [],
        issues: buildFailureIssues({
          path: markerPath,
          failure: markerResult.failure,
          privacyDenialCode: params.privacyDenialCode,
        }),
      };
    }
  }

  return findExistingSubpaths({
    subpaths: params.selection.subpaths,
    folderPath: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });
}

async function findExistingSubpaths(params: {
  subpaths: string[];
  folderPath: string;
  privacyDenialCode: string | null;
}): Promise<{ paths: string[]; issues: ScanIssue[] }> {
  const paths: string[] = [];
  const issues: ScanIssue[] = [];

  for (const subpath of params.subpaths) {
    const subpathPath = join(params.folderPath, subpath);
    const identityResult = await loadFileIdentity({ path: subpathPath });

    if (identityResult.kind === 'failed') {
      issues.push(
        ...buildFailureIssues({
          path: subpathPath,
          failure: identityResult.failure,
          privacyDenialCode: params.privacyDenialCode,
        }),
      );
      continue;
    }

    paths.push(subpathPath);
  }

  return { paths: paths, issues: issues };
}
