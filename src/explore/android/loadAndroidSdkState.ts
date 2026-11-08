import { basename, join } from 'node:path';
import { joinAbsolutePath, listPathNames } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryNames,
  loadExploreEntryStats,
  loadExploreFileText,
} from '../loadExploreRead.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import {
  loadAndroidChildPaths,
  loadAndroidPackageFolder,
  loadAndroidPackageFolders,
} from './loadAndroidPackageFolder.js';
import type { AndroidSdkRoot } from './loadAndroidSdkRoots.js';
import { loadEachAndroidSdkRoot } from './loadAndroidSdkRoots.js';
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

/** An SDK at one of its roots, with its package folders that hold a `package.xml`. */
export type AndroidSdk = {
  sdkRoot: AbsolutePath;
  systemImages: AndroidPackageFolder[];
  /** `null` when `<sdk>/emulator` holds no `package.xml`. */
  emulator: AndroidPackageFolder | null;
};

/** What the reads of the SDKs and of `~/.android/avd` found. */
export type AndroidSdkState = {
  /** The rules of the paths read, by which the image an AVD names matches a folder of an SDK. */
  pathRules: PathRules;
  /** The SDKs of the roots that are folders, in the roots' order; none without an SDK. */
  sdks: AndroidSdk[];
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
 * Reads the SDKs at `sdkRoots` and the AVDs, for the three Android probes and the rechecks of
 * their units. A read that is absent or unfit is a fact of the state; a failed read fails, but in
 * a root that is not required it leaves only that root's SDK out.
 */
export async function loadAndroidSdkState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  sdkRoots: AndroidSdkRoot[];
  privacyDenialCode: string | null;
}): Promise<Result<AndroidSdkState, ExploreFileUnreadable>> {
  const sdks = await loadEachAndroidSdkRoot({
    roots: params.sdkRoots,
    loadRoot: (sdkRoot) =>
      loadAndroidSdk({
        pathRules: params.pathRules,
        sdkRoot: sdkRoot.path,
        privacyDenialCode: params.privacyDenialCode,
      }),
  });

  if (sdks.kind === 'failed') {
    return sdks;
  }

  const avds = await loadAndroidAvds({
    pathRules: params.pathRules,
    avdHomePath: buildAndroidAvdHomePath({ pathRules: params.pathRules, homeDir: params.homeDir }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (avds.kind === 'failed') {
    return avds;
  }

  return {
    kind: 'succeeded',
    value: { pathRules: params.pathRules, sdks: sdks.value, avds: avds.value },
  };
}

/** The folder of the AVDs the probes read, `~/.android/avd`. */
export function buildAndroidAvdHomePath(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: AVD_HOME_FOLDER_NAMES,
  });
}

async function loadAndroidSdk(params: {
  pathRules: PathRules;
  sdkRoot: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidSdk | null, ExploreFileUnreadable>> {
  const names = await loadExploreDirectoryNames({
    path: params.sdkRoot,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const systemImages = await loadAndroidSystemImageFolders({
    pathRules: params.pathRules,
    sdkRoot: params.sdkRoot,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (systemImages.kind === 'failed') {
    return systemImages;
  }

  const emulator = await loadAndroidPackageFolder({
    folderPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.sdkRoot,
      names: ['emulator'],
    }),
    privacyDenialCode: params.privacyDenialCode,
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
  pathRules: PathRules;
  sdkRoot: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPackageFolder[], ExploreFileUnreadable>> {
  let folderPaths = [
    joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.sdkRoot,
      names: ['system-images'],
    }),
  ];

  for (let depth = 0; depth < SYSTEM_IMAGE_FOLDER_DEPTH; depth++) {
    const childPaths = await loadAndroidChildPaths({
      pathRules: params.pathRules,
      parentPaths: folderPaths,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (childPaths.kind === 'failed') {
      return childPaths;
    }

    folderPaths = childPaths.value;
  }

  return loadAndroidPackageFolders({
    folderPaths: folderPaths,
    privacyDenialCode: params.privacyDenialCode,
  });
}

async function loadAndroidAvds(params: {
  pathRules: PathRules;
  avdHomePath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidAvd[] | null, ExploreFileUnreadable>> {
  const names = await loadExploreDirectoryNames({
    path: params.avdHomePath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const avds: AndroidAvd[] = [];

  for (const name of names.value.filter((entryName) => entryName.endsWith(AVD_INI_SUFFIX))) {
    const avd = await loadAndroidAvd({
      pathRules: params.pathRules,
      iniPath: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.avdHomePath,
        names: [name],
      }),
      privacyDenialCode: params.privacyDenialCode,
    });

    if (avd.kind === 'failed') {
      return avd;
    }

    avds.push(avd.value);
  }

  return { kind: 'succeeded', value: avds };
}

async function loadAndroidAvd(params: {
  pathRules: PathRules;
  iniPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidAvd, ExploreFileUnreadable>> {
  const parsedName = parseAndroidAvdName({ text: basename(params.iniPath, AVD_INI_SUFFIX) });
  const name = parsedName.kind === 'succeeded' ? parsedName.value : null;
  const ini = await loadExploreFileText({
    path: params.iniPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (ini.kind === 'failed') {
    return ini;
  }

  const unlocated: AndroidAvdUnlocated = { kind: 'unlocated', iniPath: params.iniPath, name: name };

  if (ini.value.kind !== 'text') {
    return { kind: 'succeeded', value: unlocated };
  }

  const avdPath = parseAbsolutePath({
    rules: params.pathRules,
    text: parseAndroidIniText({ text: ini.value.text }).get('path') ?? '',
  });

  if (avdPath.kind === 'failed') {
    return { kind: 'succeeded', value: unlocated };
  }

  const folderNames = await loadExploreDirectoryNames({
    path: avdPath.value,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folderNames.kind === 'failed') {
    return folderNames;
  }

  if (folderNames.value === null) {
    return {
      kind: 'succeeded',
      value: { kind: 'missing', iniPath: params.iniPath, name: name, avdPath: avdPath.value },
    };
  }

  const imageSysdir = await loadAndroidImageSysdir({
    pathRules: params.pathRules,
    avdPath: avdPath.value,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (imageSysdir.kind === 'failed') {
    return imageSysdir;
  }

  const lastUsedAtMs = await loadAndroidAvdLastUsedAtMs({
    avdPath: avdPath.value,
    privacyDenialCode: params.privacyDenialCode,
  });

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
  pathRules: PathRules;
  avdPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<string | null, ExploreFileUnreadable>> {
  const configIni = await loadExploreFileText({
    path: join(params.avdPath, 'config.ini'),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (configIni.kind === 'failed') {
    return configIni;
  }

  if (configIni.value.kind !== 'text') {
    return { kind: 'succeeded', value: null };
  }

  const imageSysdir = parseAndroidIniText({ text: configIni.value.text }).get(IMAGE_SYSDIR_KEY);

  if (imageSysdir === undefined) {
    return { kind: 'succeeded', value: null };
  }

  return {
    kind: 'succeeded',
    value: parseAndroidImageSysdir({ pathRules: params.pathRules, text: imageSysdir }),
  };
}

/**
 * The `image.sysdir.1` of an AVD, relative to the SDK, in the separator of `pathRules`; `null`
 * for an empty one. The SDK on Windows writes it with backslashes, and a hand-made AVD may carry
 * slashes, so on Windows both separate its names; on macOS the text stays as written.
 */
export function parseAndroidImageSysdir(params: {
  pathRules: PathRules;
  text: string;
}): string | null {
  if (params.text === '') {
    return null;
  }

  switch (params.pathRules.rootForm) {
    case 'posix':
      return params.text;
    case 'win32': {
      const names = listPathNames({ rules: params.pathRules, path: params.text });

      return names.length === 0 ? null : names.join(params.pathRules.separator);
    }
  }
}

async function loadAndroidAvdLastUsedAtMs(params: {
  avdPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<number | null, ExploreFileUnreadable>> {
  let lastUsedAtMs: number | null = null;

  for (const fileName of AVD_LAST_USE_FILE_NAMES) {
    const stats = await loadExploreEntryStats({
      path: join(params.avdPath, fileName),
      privacyDenialCode: params.privacyDenialCode,
    });

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
