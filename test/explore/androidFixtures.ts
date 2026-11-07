import { mkdir, writeFile } from 'node:fs/promises';
import { posix } from 'node:path';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { updateModifiedMs } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

/** A last use before `ANDROID_UNUSED_CUTOFF_MS`. */
export const ANDROID_OLD_USE_MS = 1_600_000_000_000;

export const ANDROID_UNUSED_CUTOFF_MS = 1_700_000_000_000;

/** A last use after `ANDROID_UNUSED_CUTOFF_MS`. */
export const ANDROID_RECENT_USE_MS = 1_800_000_000_000;

export const ANDROID_EMULATOR_PROCESS_COMMAND =
  '/Users/example/Library/Android/sdk/emulator/qemu/darwin-aarch64/qemu-system-aarch64 -avd Pixel';

export function buildAndroidSdkRoot(params: { homeDir: string }): AbsolutePath {
  return buildTestAbsolutePath({ text: posix.join(params.homeDir, 'Library', 'Android', 'sdk') });
}

export function buildAndroidAvdHome(params: { homeDir: string }): string {
  return posix.join(params.homeDir, '.android', 'avd');
}

/** The sysdir an AVD's `config.ini` names for `writeAndroidSystemImage` of the same parts. */
export function buildAndroidImageSysdir(params: { platform: string; abi: string }): string {
  return `system-images/${params.platform}/google_apis/${params.abi}/`;
}

/** Creates `~/.android/avd`, empty, so the folder exists with no AVD. */
export async function createAndroidAvdHome(params: { homeDir: string }): Promise<void> {
  await mkdir(buildAndroidAvdHome(params), { recursive: true });
}

/**
 * Writes `<name>.ini` and its folder, `<name>.avd` unless `folderName` names another, with a
 * `config.ini` that names `imageSysdir`, or none without it, and a `hardware-qemu.ini`; both files
 * are dated `lastUsedAtMs`.
 */
export async function writeAndroidAvd(params: {
  homeDir: string;
  name: string;
  folderName?: string;
  imageSysdir: string | null;
  lastUsedAtMs: number;
}): Promise<{ iniPath: AbsolutePath; avdPath: AbsolutePath }> {
  const avdHome = buildAndroidAvdHome(params);
  const folderName = params.folderName ?? `${params.name}.avd`;
  const avdPath = posix.join(avdHome, folderName);
  const iniPath = posix.join(avdHome, `${params.name}.ini`);
  const configLines = ['AvdId=Example', 'abi.type=arm64-v8a'];

  if (params.imageSysdir !== null) {
    configLines.push(`image.sysdir.1=${params.imageSysdir}`);
  }

  await mkdir(avdPath, { recursive: true });
  await writeFile(
    iniPath,
    `avd.ini.encoding=UTF-8\npath=${avdPath}\npath.rel=avd/${folderName}\ntarget=android-35\n`,
  );
  await writeFile(posix.join(avdPath, 'config.ini'), `${configLines.join('\n')}\n`);
  await writeFile(posix.join(avdPath, 'hardware-qemu.ini'), 'hw.cpu.arch = arm64\n');
  await updateModifiedMs({
    path: posix.join(avdPath, 'config.ini'),
    modifiedMs: params.lastUsedAtMs,
  });
  await updateModifiedMs({
    path: posix.join(avdPath, 'hardware-qemu.ini'),
    modifiedMs: params.lastUsedAtMs,
  });

  return {
    iniPath: buildTestAbsolutePath({ text: iniPath }),
    avdPath: buildTestAbsolutePath({ text: avdPath }),
  };
}

/** Writes `<sdkRoot>/system-images/<platform>/google_apis/<abi>/package.xml`; returns the folder. */
export async function writeAndroidSystemImage(params: {
  sdkRoot: string;
  platform: string;
  abi: string;
}): Promise<AbsolutePath> {
  const folderPath = posix.join(
    params.sdkRoot,
    'system-images',
    params.platform,
    'google_apis',
    params.abi,
  );

  await mkdir(folderPath, { recursive: true });
  await writeFile(
    posix.join(folderPath, 'package.xml'),
    buildAndroidPackageXml({
      packagePath: `system-images;${params.platform};google_apis;${params.abi}`,
    }),
  );

  return buildTestAbsolutePath({ text: folderPath });
}

/** Writes `<sdk>/emulator/package.xml`; returns the folder. */
export async function writeAndroidEmulator(params: { homeDir: string }): Promise<AbsolutePath> {
  const folderPath = posix.join(buildAndroidSdkRoot(params), 'emulator');

  await mkdir(folderPath, { recursive: true });
  await writeFile(
    posix.join(folderPath, 'package.xml'),
    buildAndroidPackageXml({ packagePath: 'emulator' }),
  );

  return buildTestAbsolutePath({ text: folderPath });
}

/**
 * Writes `<sdk>/platforms/<folderName>/package.xml` naming `packagePath`, by default
 * `platforms;<folderName>`; returns the folder.
 */
export async function writeAndroidPlatform(params: {
  homeDir: string;
  folderName: string;
  packagePath?: string;
}): Promise<AbsolutePath> {
  const folderPath = posix.join(buildAndroidSdkRoot(params), 'platforms', params.folderName);

  await mkdir(folderPath, { recursive: true });
  await writeFile(
    posix.join(folderPath, 'package.xml'),
    buildAndroidPackageXml({ packagePath: params.packagePath ?? `platforms;${params.folderName}` }),
  );

  return buildTestAbsolutePath({ text: folderPath });
}

export function buildAndroidPackageXml(params: { packagePath: string }): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/02">
<localPackage path="${params.packagePath}" obsolete="false">
<revision><major>35</major></revision>
</localPackage>
</ns2:repository>
`;
}
