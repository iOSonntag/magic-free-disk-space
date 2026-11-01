import { open, opendir } from 'node:fs/promises';
import { join } from 'node:path';
import type { FullDiskAccess, FullDiskAccessProbeOutcome } from './decideFullDiskAccess.js';
import { decideFullDiskAccess, readFailureVerdictToProbeOutcome } from './decideFullDiskAccess.js';
import { getErrorCode } from './getErrorCode.js';
import { getDirectoryFailure } from './loadDirectoryNames.js';
import { getFileFailure } from './loadFileIdentity.js';
import { decideReadFailure } from './readFailure.js';
import { runFilesystemCall } from './runFilesystemCall.js';

const TCC_DATABASE_RELATIVE_PATH = 'Library/Application Support/com.apple.TCC/TCC.db';
const SAFARI_FOLDER_RELATIVE_PATH = 'Library/Safari';

/**
 * Probes whether this process has Full Disk Access by opening the TCC database of `homeDir` and,
 * when that decides nothing, its Safari folder. Reads no byte and lists no name, since macOS privacy
 * protection refuses a guarded path at the open already. Never throws.
 */
export async function loadFullDiskAccess(params: { homeDir: string }): Promise<FullDiskAccess> {
  const tccDatabase = await probeTccDatabase(join(params.homeDir, TCC_DATABASE_RELATIVE_PATH));

  if (tccDatabase === 'opened' || tccDatabase === 'privacyDenied') {
    return decideFullDiskAccess({ tccDatabase: tccDatabase });
  }

  const safari = await probeSafariFolder(join(params.homeDir, SAFARI_FOLDER_RELATIVE_PATH));

  return decideFullDiskAccess({ tccDatabase: tccDatabase, safari: safari });
}

async function probeTccDatabase(path: string): Promise<FullDiskAccessProbeOutcome> {
  try {
    await runFilesystemCall(() => openAndCloseFile(path));

    return 'opened';
  } catch (error) {
    const failure = getFileFailure({ code: getErrorCode(error) });

    return readFailureVerdictToProbeOutcome(decideReadFailure(failure));
  }
}

async function probeSafariFolder(path: string): Promise<FullDiskAccessProbeOutcome> {
  try {
    await runFilesystemCall(() => openAndCloseFolder(path));

    return 'opened';
  } catch (error) {
    const failure = getDirectoryFailure({ code: getErrorCode(error) });

    return readFailureVerdictToProbeOutcome(decideReadFailure(failure));
  }
}

async function openAndCloseFile(path: string): Promise<void> {
  const handle = await open(path, 'r');

  await handle.close();
}

async function openAndCloseFolder(path: string): Promise<void> {
  const folder = await opendir(path);

  await folder.close();
}
