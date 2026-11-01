import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import type { FullDiskAccess } from './decideFullDiskAccess.js';
import { readFailureVerdictToFullDiskAccess } from './decideFullDiskAccess.js';
import { getErrorCode } from './getErrorCode.js';
import type { DirectoryFailure } from './loadDirectoryNames.js';
import { getDirectoryFailure } from './loadDirectoryNames.js';
import type { FileFailure } from './loadFileIdentity.js';
import { getFileFailure } from './loadFileIdentity.js';
import { decideReadFailure } from './readFailure.js';
import { runFilesystemCall } from './runFilesystemCall.js';

const TCC_DATABASE_RELATIVE_PATH = 'Library/Application Support/com.apple.TCC/TCC.db';
const SAFARI_FOLDER_RELATIVE_PATH = 'Library/Safari';

/**
 * Probes whether this process has Full Disk Access by opening and closing the TCC database of
 * `homeDir` and, when that decides nothing, its Safari folder. Reads no byte and lists no name,
 * since macOS privacy protection refuses a guarded path at the open already. Never throws.
 */
export async function loadFullDiskAccess(params: { homeDir: string }): Promise<FullDiskAccess> {
  const tccDatabase = await probeFullDiskAccessPath({
    path: join(params.homeDir, TCC_DATABASE_RELATIVE_PATH),
    openPath: openFileWithoutReading,
    getFailure: getFileFailure,
  });

  if (tccDatabase !== 'unknown') {
    return tccDatabase;
  }

  return probeFullDiskAccessPath({
    path: join(params.homeDir, SAFARI_FOLDER_RELATIVE_PATH),
    openPath: openFolderWithoutListing,
    getFailure: getDirectoryFailure,
  });
}

async function probeFullDiskAccessPath(params: {
  path: string;
  openPath: (path: string) => Promise<void>;
  getFailure: (failure: { code: string }) => FileFailure | DirectoryFailure;
}): Promise<FullDiskAccess> {
  try {
    await runFilesystemCall(() => params.openPath(params.path));

    return 'granted';
  } catch (error) {
    const failure = params.getFailure({ code: getErrorCode(error) });

    return readFailureVerdictToFullDiskAccess(decideReadFailure(failure));
  }
}

async function openFileWithoutReading(path: string): Promise<void> {
  const handle = await open(path, 'r');

  await handle.close();
}

// Bun's opendir checks only that the path exists and fails first at the read, so it never meets
// the privacy check of the open; an open of the folder itself does.
async function openFolderWithoutListing(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);

  await handle.close();
}
