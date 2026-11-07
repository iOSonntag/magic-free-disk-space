import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module system. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: [
    'createConcurrencyLimit.ts',
    'entryReads.ts',
    'fullDiskAccess.ts',
    'getErrorCode.ts',
    'isAnyBundleRunning.ts',
    'limits.ts',
    'loadCommandOutput.ts',
    'loadDirectoryEntries.ts',
    'loadDirectoryNames.ts',
    'loadEntryStats.ts',
    'loadFileBytes.ts',
    'loadFileIdentity.ts',
    'loadFileText.ts',
    'loadRealPath.ts',
    'parseJsonValue.ts',
    'parseProcessCommandLines.ts',
    'readFailure.ts',
    'requestUnixSocket.ts',
    'runFilesystemCall.ts',
    'systemPlatform.ts',
    'userIdentity.ts',
    'volumeSpace.ts',
    'walkDirectoryTree.ts',
  ],
} satisfies ModuleBoundary;
