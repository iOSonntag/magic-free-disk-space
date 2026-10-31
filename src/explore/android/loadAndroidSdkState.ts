import { basename, join } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryNames,
  loadExploreEntryStats,
  loadExploreFileText,
} from '../loadExploreRead.js';
import { ANDROID_SDK_PATH_NAMES } from './androidSdkRoot.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidPackageFolder } from './loadAndroidPackageFolder.js';
import type { AndroidAvdName } from './parseAndroidAvdName.js';
import { parseAndroidAvdName } from './parseAndroidAvdName.js';
import { parseAndroidIniText } from './parseAndroidIniText.js';

/** An AVD whose `<name>.ini` is unfit or names no absolute `path`, so nothing more of it is known. */
export type AndroidAvdUnlocated = {
  kind: 'unlocated';
  iniPath: AbsolutePath;
  /** `null` when the file name is no AVD name, such as one that could start an option. */
  name: AndroidAvdName | null;
};

/** An AVD whose folder is not here, such as one on an unmounted volume. */
export type AndroidAvdMissing = {
  kind: 'missing';
  iniPath: AbsolutePath;
  name: AndroidAvdName | null;
  avdPath: AbsolutePath;
};

export type AndroidAvdPresent = {
  kind: 'present';
  iniPath: AbsolutePath;
  name: AndroidAvdName | null;
  avdPath: AbsolutePath;
  /** `image.sysdir.1` of its `config.ini`, relative to the SDK; `null` when it cannot be read. */
  imageSysdir: string | null;
  /** The newest mtime of its last-use files; `null` when none of them is present. */
  lastUsedAtMs: number | null;
};

/** One `*.ini` of `~/.android/avd`, and what its folder told. */
export type AndroidAvd = AndroidAvdUnlocated | AndroidAvdMissing | AndroidAvdPresent;

/** The SDK at `~/Library/Android/sdk`, with its package folders that hold a `package.xml`. */
export type AndroidSdk = {
  sdkRoot: AbsolutePath;
  systemImages: AndroidPackageFolder[];
  /** `null` when `<sdk>/emulator` holds no `package.xml`. */
  emulator: AndroidPackageFolder | null;
};

/** What the reads of the SDK and of `~/.android/avd` found. */
export type AndroidSdkState = {
  /** `null` without an SDK. */
  sdk: AndroidSdk | null;
  /** `null` when `~/.android/avd` is absent, so the AVDs may live elsewhere. */
  avds: AndroidAvd[] | null;
};

const AVD_HOME_FOLDER_NAMES = ['.android', 'avd'];

const AVD_INI_SUFFIX = '.ini';

const AVD_LAST_USE_FILE_NAMES = [
  'hardware-qemu.ini',
  'emulator-user.ini',
  'multiinstance.lock',
  'config.ini',
];

const IMAGE_SYSDIR_KEY = 'image.sysdir.1';

// `system-images/<platform>/<tag>/<abi>`, each level a folder.
const SYSTEM_IMAGE_FOLDER_DEPTH = 3;

/**
 * Reads the SDK and the AVDs, for the three Android probes and the rechecks of their units.
 * A read that is absent or unfit is a fact of the state; only a failed read fails.
 */
export async function loadAndroidSdkState(params: {
  homeDir: AbsolutePath;
}): Promise<Result<AndroidSdkState, ExploreFileUnreadable>> {
  const sdk = await loadAndroidSdk({
    sdkRoot: joinAbsolutePath({ parentPath: params.homeDir, names: ANDROID_SDK_PATH_NAMES }),
  });

  if (sdk.kind === 'failed') {
    return sdk;
  }

  const avds = await loadAndroidAvds({
    avdHomePath: joinAbsolutePath({ parentPath: params.homeDir, names: AVD_HOME_FOLDER_NAMES }),
  });

  if (avds.kind === 'failed') {
    return avds;
  }

  return { kind: 'succeeded', value: { sdk: sdk.value, avds: avds.value } };
}

async function loadAndroidSdk(params: {
  sdkRoot: AbsolutePath;
}): Promise<Result<AndroidSdk | null, ExploreFileUnreadable>> {
  const names = await loadExploreDirectoryNames({ path: params.sdkRoot });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const systemImages = await loadAndroidSystemImageFolders({ sdkRoot: params.sdkRoot });

  if (systemImages.kind === 'failed') {
    return systemImages;
  }

  const emulator = await loadAndroidPackageFolder({
    folderPath: joinAbsolutePath({ parentPath: params.sdkRoot, names: ['emulator'] }),
  });

  if (emulator.kind === 'failed') {
    return emulator;
  }

  return {
    kind: 'succeeded',
    value: { sdkRoot: params.sdkRoot, systemImages: systemImages.value, emulator: emulator.value },
  };
}

async function loadAndroidSystemImageFolders(params: {
  sdkRoot: AbsolutePath;
}): Promise<Result<AndroidPackageFolder[], ExploreFileUnreadable>> {
  let folderPaths = [joinAbsolutePath({ parentPath: params.sdkRoot, names: ['system-images'] })];

  for (let depth = 0; depth < SYSTEM_IMAGE_FOLDER_DEPTH; depth++) {
    const childPaths = await loadAndroidChildPaths({ parentPaths: folderPaths });

    if (childPaths.kind === 'failed') {
      return childPaths;
    }

    folderPaths = childPaths.value;
  }

  const packageFolders: AndroidPackageFolder[] = [];

  for (const folderPath of folderPaths) {
    const packageFolder = await loadAndroidPackageFolder({ folderPath: folderPath });

    if (packageFolder.kind === 'failed') {
      return packageFolder;
    }

    if (packageFolder.value !== null) {
      packageFolders.push(packageFolder.value);
    }
  }

  return { kind: 'succeeded', value: packageFolders };
}

/** The entries of each parent folder; a parent that is absent or no folder has none. */
async function loadAndroidChildPaths(params: {
  parentPaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const childPaths: AbsolutePath[] = [];

  for (const parentPath of params.parentPaths) {
    const names = await loadExploreDirectoryNames({ path: parentPath });

    if (names.kind === 'failed') {
      return names;
    }

    for (const name of names.value ?? []) {
      childPaths.push(joinAbsolutePath({ parentPath: parentPath, names: [name] }));
    }
  }

  return { kind: 'succeeded', value: childPaths };
}

async function loadAndroidAvds(params: {
  avdHomePath: AbsolutePath;
}): Promise<Result<AndroidAvd[] | null, ExploreFileUnreadable>> {
  const names = await loadExploreDirectoryNames({ path: params.avdHomePath });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const avds: AndroidAvd[] = [];

  for (const name of names.value.filter((entryName) => entryName.endsWith(AVD_INI_SUFFIX))) {
    const avd = await loadAndroidAvd({
      iniPath: joinAbsolutePath({ parentPath: params.avdHomePath, names: [name] }),
    });

    if (avd.kind === 'failed') {
      return avd;
    }

    avds.push(avd.value);
  }

  return { kind: 'succeeded', value: avds };
}

async function loadAndroidAvd(params: {
  iniPath: AbsolutePath;
}): Promise<Result<AndroidAvd, ExploreFileUnreadable>> {
  const parsedName = parseAndroidAvdName({ text: basename(params.iniPath, AVD_INI_SUFFIX) });
  const name = parsedName.kind === 'succeeded' ? parsedName.value : null;
  const ini = await loadExploreFileText({ path: params.iniPath });

  if (ini.kind === 'failed') {
    return ini;
  }

  const unlocated: AndroidAvdUnlocated = { kind: 'unlocated', iniPath: params.iniPath, name: name };

  if (ini.value.kind !== 'text') {
    return { kind: 'succeeded', value: unlocated };
  }

  const avdPath = parseAbsolutePath({
    text: parseAndroidIniText({ text: ini.value.text }).get('path') ?? '',
  });

  if (avdPath.kind === 'failed') {
    return { kind: 'succeeded', value: unlocated };
  }

  const folderNames = await loadExploreDirectoryNames({ path: avdPath.value });

  if (folderNames.kind === 'failed') {
    return folderNames;
  }

  if (folderNames.value === null) {
    return {
      kind: 'succeeded',
      value: { kind: 'missing', iniPath: params.iniPath, name: name, avdPath: avdPath.value },
    };
  }

  const imageSysdir = await loadAndroidImageSysdir({ avdPath: avdPath.value });

  if (imageSysdir.kind === 'failed') {
    return imageSysdir;
  }

  const lastUsedAtMs = await loadAndroidAvdLastUsedAtMs({ avdPath: avdPath.value });

  if (lastUsedAtMs.kind === 'failed') {
    return lastUsedAtMs;
  }

  return {
    kind: 'succeeded',
    value: {
      kind: 'present',
      iniPath: params.iniPath,
      name: name,
      avdPath: avdPath.value,
      imageSysdir: imageSysdir.value,
      lastUsedAtMs: lastUsedAtMs.value,
    },
  };
}

/** `null` when `config.ini` is absent or unfit, or holds no `image.sysdir.1`. */
async function loadAndroidImageSysdir(params: {
  avdPath: AbsolutePath;
}): Promise<Result<string | null, ExploreFileUnreadable>> {
  const configIni = await loadExploreFileText({ path: join(params.avdPath, 'config.ini') });

  if (configIni.kind === 'failed') {
    return configIni;
  }

  if (configIni.value.kind !== 'text') {
    return { kind: 'succeeded', value: null };
  }

  const imageSysdir = parseAndroidIniText({ text: configIni.value.text }).get(IMAGE_SYSDIR_KEY);

  if (imageSysdir === undefined || imageSysdir === '') {
    return { kind: 'succeeded', value: null };
  }

  return { kind: 'succeeded', value: imageSysdir };
}

async function loadAndroidAvdLastUsedAtMs(params: {
  avdPath: AbsolutePath;
}): Promise<Result<number | null, ExploreFileUnreadable>> {
  let lastUsedAtMs: number | null = null;

  for (const fileName of AVD_LAST_USE_FILE_NAMES) {
    const stats = await loadExploreEntryStats({ path: join(params.avdPath, fileName) });

    if (stats.kind === 'failed') {
      return stats;
    }

    if (stats.value === null) {
      continue;
    }

    lastUsedAtMs = Math.max(lastUsedAtMs ?? stats.value.modifiedMs, stats.value.modifiedMs);
  }

  return { kind: 'succeeded', value: lastUsedAtMs };
}
