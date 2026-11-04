import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module system. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: [
    'createConcurrencyLimit.ts',
    'fullDiskAccess.ts',
    'getErrorCode.ts',
    'hasDatalessFlag.ts',
    'isAnyBundleRunning.ts',
    'limits.ts',
    'loadCommandOutput.ts',
    'loadDirectoryEntries.ts',
    'loadDirectoryNames.ts',
    'loadEntryStats.ts',
    'loadFileBytes.ts',
    'loadFileIdentity.ts',
    'loadFileText.ts',
    'loadFullDiskAccess.ts',
    'loadRealPath.ts',
    'parseJsonValue.ts',
    'readFailure.ts',
    'runFilesystemCall.ts',
    'systemPlatform.ts',
    'userIdentity.ts',
    'walkDirectoryTree.ts',
  ],
} satisfies ModuleBoundary;
