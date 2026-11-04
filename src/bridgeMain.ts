import { createBridgeIo } from './bridge/bridgeIo.js';
import { runBridge } from './bridge/runBridge.js';
import { darwinPlatform } from './platform/darwin/darwinPlatform.js';
import type { Platform } from './platform/platform.js';
import { parsePlatformId } from './platform/platform.js';
import { loadPreferences, saveIsUpdateCheckEnabled } from './preferences/preferencesFile.js';
import { formatUnsupportedPlatform } from './report/formatEnvironmentFailure.js';
import { stopRunningToolsOnProcessEnd } from './tools/runToolCommand.js';
import { fetchLatestReleaseVersion } from './update/fetchLatestReleaseVersion.js';
import { LATEST_RELEASE_API_URL, LATEST_RELEASE_FETCH_TIMEOUT_MS } from './update/githubRelease.js';
import type { ReleaseVersion } from './update/releaseVersion.js';
import { parseReleaseVersion } from './update/releaseVersion.js';

// The release build sets it with `bun build --define`; a build from source leaves it undeclared.
declare const RELEASE_VERSION: string | undefined;

const DONE_EXIT_CODE = 0;

const CANNOT_START_EXIT_CODE = 2;

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
  const platformId = parsePlatformId({ text: process.platform });

  if (platformId.kind === 'failed') {
    return refuseUnsupportedPlatform();
  }

  switch (platformId.value) {
    case 'darwin':
      return runBridgeOnPlatform({ platform: darwinPlatform });
    case 'win32':
      return refuseUnsupportedPlatform();
  }
}

/** Runs the bridge with the platform's slices, its tools stopped on every end of the process. */
async function runBridgeOnPlatform(params: { platform: Platform }): Promise<number> {
  stopRunningToolsOnProcessEnd({ processEndSignals: params.platform.tools.processEndSignals });

  const releaseVersion = getReleaseVersion();
  const end = await runBridge({
    io: createBridgeIo(),
    environment: params.platform.environment,
    catalog: params.platform.catalog,
    tools: params.platform.tools,
    scan: params.platform.scan,
    system: params.platform.system,
    delete: params.platform.delete,
    explore: params.platform.explore,
    texts: params.platform.report,
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

/** Tells the app, as `runBridge` tells it of an unsafe environment, that the bridge cannot start. */
function refuseUnsupportedPlatform(): number {
  createBridgeIo().writeEvent({
    kind: 'failed',
    message: formatUnsupportedPlatform(),
    effect: 'bridgeStopping',
  });

  return CANNOT_START_EXIT_CODE;
}

process.exitCode = await main();
