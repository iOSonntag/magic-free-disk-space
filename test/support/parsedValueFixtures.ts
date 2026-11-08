import type {
  CatalogOwner,
  MacBundleId,
  WindowsImageName,
} from '../../src/catalog/catalogOwner.js';
import { parseMacBundleId, parseWindowsImageName } from '../../src/catalog/catalogOwner.js';
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
import type { RustupToolchainName } from '../../src/explore/rustupToolchains/rustupToolchainName.js';
import { parseRustupToolchainName } from '../../src/explore/rustupToolchains/rustupToolchainName.js';
import type { SimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { parseSimulatorDeviceUdid } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntimeId } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeId.js';
import { parseSimulatorRuntimeId } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeId.js';
import {
  parseVagrantBoxName,
  parseVagrantBoxProvider,
  parseVagrantBoxVersion,
} from '../../src/explore/vagrantBoxes/parseVagrantBoxNames.js';
import type {
  VagrantBoxName,
  VagrantBoxProvider,
  VagrantBoxVersion,
} from '../../src/explore/vagrantBoxes/vagrantBoxNames.js';
import type { DriveRoot } from '../../src/path/driveRoot.js';
import { parseDriveRoot } from '../../src/path/driveRoot.js';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { PathRules } from '../../src/path/pathRules.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { Result } from '../../src/result.js';
import type { UserIdentity, WindowsSid } from '../../src/system/userIdentity.js';
import { parsePosixUid, parseWindowsSid } from '../../src/system/userIdentity.js';

/** Branded values for fixtures, each made by its one maker; a value that fails it throws. */

/** The rules of the operating system that runs the tests, for the paths it names itself. */
export const HOST_PATH_RULES: PathRules =
  process.platform === 'win32' ? WIN32_PATH_RULES : POSIX_PATH_RULES;

/** An example macOS path, such as `/Users/test/Library`, the same on every host. */
export function buildTestAbsolutePath(params: { text: string }): AbsolutePath {
  return unwrapFixtureValue({
    parsed: parseAbsolutePath({ rules: POSIX_PATH_RULES, text: params.text }),
    text: params.text,
  });
}

/** A path the host names, such as one below its temporary folder, under the rules of the host. */
export function buildTestHostPath(params: { text: string }): AbsolutePath {
  return unwrapFixtureValue({
    parsed: parseAbsolutePath({ rules: HOST_PATH_RULES, text: params.text }),
    text: params.text,
  });
}

/** An example Windows path, such as `C:\Users\test`, the same on every host. */
export function buildTestWindowsPath(params: { text: string }): AbsolutePath {
  return unwrapFixtureValue({
    parsed: parseAbsolutePath({ rules: WIN32_PATH_RULES, text: params.text }),
    text: params.text,
  });
}

/** The root of a Windows drive, such as `C:\`, under the Windows rules on every host. */
export function buildTestDriveRoot(params: { text: string }): DriveRoot {
  return unwrapFixtureValue({
    parsed: parseDriveRoot({ rules: WIN32_PATH_RULES, text: params.text }),
    text: params.text,
  });
}

/**
 * A home folder with the rules its paths follow: the environment of a test on the fixture root,
 * which the host names, or an example one.
 */
export type HomeFolder = { pathRules: PathRules; homeDir: AbsolutePath };

/** An example macOS home, such as `/Users/example`, the same on every host. */
export function buildExampleHome(params: { text: string }): HomeFolder {
  return { pathRules: POSIX_PATH_RULES, homeDir: buildTestAbsolutePath({ text: params.text }) };
}

/** The path of `path`, written with `/`, below the home, joined under the home's rules. */
export function joinBelowHome(params: { home: HomeFolder; path: string }): AbsolutePath {
  return joinAbsolutePath({
    rules: params.home.pathRules,
    parentPath: params.home.homeDir,
    names: params.path.split('/'),
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

export function buildTestWindowsSid(params: { text: string }): WindowsSid {
  return unwrapFixtureValue({ parsed: parseWindowsSid(params), text: params.text });
}

/** A Windows user by its SID, such as `S-1-5-21-1-2-3-1001`. */
export function buildTestWindowsUser(params: { sidText: string }): UserIdentity {
  return { kind: 'windows', sid: buildTestWindowsSid({ text: params.sidText }) };
}

export function buildTestWindowsImageName(params: { text: string }): WindowsImageName {
  return unwrapFixtureValue({ parsed: parseWindowsImageName(params), text: params.text });
}

export function buildTestMacBundleId(params: { text: string }): MacBundleId {
  return parseMacBundleId({ text: params.text });
}

/** The owner of a catalog entry: `null` for no bundle id, else the app of that bundle id. */
export function buildTestCatalogOwner(params: { bundleId: string | null }): CatalogOwner | null {
  if (params.bundleId === null) {
    return null;
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

export function buildTestRustupToolchainName(params: { text: string }): RustupToolchainName {
  return unwrapFixtureValue({ parsed: parseRustupToolchainName(params), text: params.text });
}

export function buildTestVagrantBoxName(params: { text: string }): VagrantBoxName {
  return unwrapFixtureValue({ parsed: parseVagrantBoxName(params), text: params.text });
}

export function buildTestVagrantBoxProvider(params: { text: string }): VagrantBoxProvider {
  return unwrapFixtureValue({ parsed: parseVagrantBoxProvider(params), text: params.text });
}

export function buildTestVagrantBoxVersion(params: { text: string }): VagrantBoxVersion {
  return unwrapFixtureValue({ parsed: parseVagrantBoxVersion(params), text: params.text });
}

function unwrapFixtureValue<T>(params: { parsed: Result<T, string>; text: string }): T {
  if (params.parsed.kind === 'failed') {
    throw new Error(`The fixture value "${params.text}" fails its maker: ${params.parsed.failure}`);
  }

  return params.parsed.value;
}
