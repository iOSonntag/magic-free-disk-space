import type { CatalogOwner, MacBundleId } from '../../src/catalog/catalogOwner.js';
import { parseMacBundleId } from '../../src/catalog/catalogOwner.js';
import type { AndroidAvdName } from '../../src/explore/android/parseAndroidAvdName.js';
import { parseAndroidAvdName } from '../../src/explore/android/parseAndroidAvdName.js';
import type {
  AsdfToolName,
  AsdfToolVersion,
} from '../../src/explore/asdfVersions/parseAsdfInstallNames.js';
import {
  parseAsdfToolName,
  parseAsdfToolVersion,
} from '../../src/explore/asdfVersions/parseAsdfInstallNames.js';
import type { HomebrewFormulaName } from '../../src/explore/homebrew/parseHomebrewFormulaName.js';
import { parseHomebrewFormulaName } from '../../src/explore/homebrew/parseHomebrewFormulaName.js';
import type {
  MiseToolName,
  MiseToolVersion,
} from '../../src/explore/miseVersions/parseMisePrunableVersions.js';
import {
  parseMiseToolName,
  parseMiseToolVersion,
} from '../../src/explore/miseVersions/parseMisePrunableVersions.js';
import type { NvmNodeVersion } from '../../src/explore/nvmVersions/parseNvmNodeVersion.js';
import { parseNvmNodeVersion } from '../../src/explore/nvmVersions/parseNvmNodeVersion.js';
import type { PnpmStoreVersion } from '../../src/explore/pnpmStores/parsePnpmStoreVersion.js';
import { parsePnpmStoreVersion } from '../../src/explore/pnpmStores/parsePnpmStoreVersion.js';
import type { SimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { parseSimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntimeId } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeId.js';
import { parseSimulatorRuntimeId } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeId.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { Result } from '../../src/result.js';
import type { UserIdentity } from '../../src/system/userIdentity.js';
import { parsePosixUid } from '../../src/system/userIdentity.js';

/** Branded values for fixtures, each made by its one maker; a value that fails it throws. */

export function buildTestAbsolutePath(params: { text: string }): AbsolutePath {
  return unwrapFixtureValue({
    parsed: parseAbsolutePath({ rules: DARWIN_PATH_RULES, text: params.text }),
    text: params.text,
  });
}

export function buildTestUserIdentity(params: { uid: number }): UserIdentity {
  return {
    kind: 'posix',
    uid: unwrapFixtureValue({
      parsed: parsePosixUid({ value: params.uid }),
      text: String(params.uid),
    }),
  };
}

export function buildTestMacBundleId(params: { text: string }): MacBundleId {
  return unwrapFixtureValue({ parsed: parseMacBundleId(params), text: params.text });
}

/** The owner of a catalog entry: none for `null`, else the app of that bundle id. */
export function buildTestCatalogOwner(params: { bundleId: string | null }): CatalogOwner {
  if (params.bundleId === null) {
    return { kind: 'none' };
  }

  return { kind: 'bundleId', bundleId: buildTestMacBundleId({ text: params.bundleId }) };
}

export function buildTestUdid(params: { text: string }): SimulatorDeviceUdid {
  return unwrapFixtureValue({ parsed: parseSimulatorDeviceUdid(params), text: params.text });
}

export function buildTestMiseToolName(params: { text: string }): MiseToolName {
  return unwrapFixtureValue({ parsed: parseMiseToolName(params), text: params.text });
}

export function buildTestMiseToolVersion(params: { text: string }): MiseToolVersion {
  return unwrapFixtureValue({ parsed: parseMiseToolVersion(params), text: params.text });
}

export function buildTestSimulatorRuntimeId(params: { text: string }): SimulatorRuntimeId {
  return unwrapFixtureValue({ parsed: parseSimulatorRuntimeId(params), text: params.text });
}

export function buildTestAndroidAvdName(params: { text: string }): AndroidAvdName {
  return unwrapFixtureValue({ parsed: parseAndroidAvdName(params), text: params.text });
}

export function buildTestHomebrewFormulaName(params: { text: string }): HomebrewFormulaName {
  return unwrapFixtureValue({ parsed: parseHomebrewFormulaName(params), text: params.text });
}

export function buildTestAsdfToolName(params: { text: string }): AsdfToolName {
  return unwrapFixtureValue({
    parsed: parseAsdfToolName({ folderName: params.text }),
    text: params.text,
  });
}

export function buildTestAsdfToolVersion(params: { text: string }): AsdfToolVersion {
  return unwrapFixtureValue({
    parsed: parseAsdfToolVersion({ folderName: params.text }),
    text: params.text,
  });
}

export function buildTestNvmNodeVersion(params: { text: string }): NvmNodeVersion {
  return unwrapFixtureValue({
    parsed: parseNvmNodeVersion({ folderName: params.text }),
    text: params.text,
  });
}

export function buildTestPnpmStoreVersion(params: { text: string }): PnpmStoreVersion {
  return unwrapFixtureValue({
    parsed: parsePnpmStoreVersion({ folderName: params.text }),
    text: params.text,
  });
}

function unwrapFixtureValue<T>(params: { parsed: Result<T, string>; text: string }): T {
  if (params.parsed.kind === 'failed') {
    throw new Error(`The fixture value "${params.text}" fails its maker: ${params.parsed.failure}`);
  }

  return params.parsed.value;
}
