import { createBridgeIo } from './bridge/bridgeIo.js';
import { runBridge } from './bridge/runBridge.js';
import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { loadEnvironment } from './environment/loadEnvironment.js';
import { loadPreferences, saveIsUpdateCheckEnabled } from './preferences/preferencesFile.js';
import { loadFullDiskAccess } from './system/loadFullDiskAccess.js';
import { stopRunningToolsOnProcessEnd } from './tools/runToolCommand.js';
import { TOOL_INSTALL_LOCATIONS } from './tools/toolInstallLocations.js';
import { fetchLatestReleaseVersion } from './update/fetchLatestReleaseVersion.js';
import { LATEST_RELEASE_API_URL, LATEST_RELEASE_FETCH_TIMEOUT_MS } from './update/githubRelease.js';
import type { ReleaseVersion } from './update/releaseVersion.js';
import { parseReleaseVersion } from './update/releaseVersion.js';

// The release build sets it with `bun build --define`; a build from source leaves it undeclared.
declare const RELEASE_VERSION: string | undefined;

const DONE_EXIT_CODE = 0;

const CANNOT_START_EXIT_CODE = 2;

/** 128 plus the number of SIGHUP, which a closed terminal sends. */
const HUNG_UP_EXIT_CODE = 129;

/** 128 plus the number of the signal, as a shell reports a process that SIGINT ended. */
const INTERRUPTED_EXIT_CODE = 130;

/** 128 plus the number of SIGQUIT. */
const QUIT_EXIT_CODE = 131;

/** 128 plus the number of SIGTERM. */
const TERMINATED_EXIT_CODE = 143;

/** `null` for a development build; throws for a release build whose version is no `X.Y.Z`. */
function getReleaseVersion(): ReleaseVersion | null {
  if (typeof RELEASE_VERSION !== 'string') {
    return null;
  }

  const version = parseReleaseVersion(RELEASE_VERSION);

  if (version === null) {
    throw new Error(
      `The release build carries the version "${RELEASE_VERSION}", which is no X.Y.Z`,
    );
  }

  return version;
}

async function main(): Promise<number> {
  const releaseVersion = getReleaseVersion();
  const end = await runBridge({
    io: createBridgeIo(),
    catalogEntries: CATALOG_ENTRIES,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS,
    loadEnvironment: loadEnvironment,
    loadFullDiskAccess: loadFullDiskAccess,
    clock: () => Date.now(),
    releaseVersion: releaseVersion,
    fetchLatestReleaseVersion: () =>
      fetchLatestReleaseVersion({
        url: LATEST_RELEASE_API_URL,
        timeoutMs: LATEST_RELEASE_FETCH_TIMEOUT_MS,
      }),
    loadPreferences: loadPreferences,
    saveIsUpdateCheckEnabled: saveIsUpdateCheckEnabled,
  });

  switch (end) {
    case 'inputEnded':
      return DONE_EXIT_CODE;
    case 'cannotStart':
      return CANNOT_START_EXIT_CODE;
  }
}

stopRunningToolsOnProcessEnd({
  signalExitCodes: {
    SIGHUP: HUNG_UP_EXIT_CODE,
    SIGINT: INTERRUPTED_EXIT_CODE,
    SIGQUIT: QUIT_EXIT_CODE,
    SIGTERM: TERMINATED_EXIT_CODE,
  },
});

process.exitCode = await main();
