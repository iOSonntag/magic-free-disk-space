import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreDirectoryNames } from '../loadExploreRead.js';
import { ANDROID_SDK_PATH_NAMES } from './androidSdkRoot.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidPackageFolder } from './loadAndroidPackageFolder.js';

/** The platform folders of the SDK that hold a `package.xml`; none without an SDK or `platforms`. */
export type AndroidPlatformState = {
  sdkRoot: AbsolutePath;
  platforms: AndroidPackageFolder[];
};

/**
 * Reads `<sdk>/platforms/*`, for the platform probe and the recheck of its units alone, so a failed
 * read fails neither the AVD, system image, nor emulator probe.
 */
export async function loadAndroidPlatformState(params: {
  homeDir: AbsolutePath;
}): Promise<Result<AndroidPlatformState, ExploreFileUnreadable>> {
  const sdkRoot = joinAbsolutePath({ parentPath: params.homeDir, names: ANDROID_SDK_PATH_NAMES });
  const platformsPath = joinAbsolutePath({ parentPath: sdkRoot, names: ['platforms'] });
  const names = await loadExploreDirectoryNames({ path: platformsPath });

  if (names.kind === 'failed') {
    return names;
  }

  const platforms: AndroidPackageFolder[] = [];

  for (const name of names.value ?? []) {
    const packageFolder = await loadAndroidPackageFolder({
      folderPath: joinAbsolutePath({ parentPath: platformsPath, names: [name] }),
    });

    if (packageFolder.kind === 'failed') {
      return packageFolder;
    }

    if (packageFolder.value !== null) {
      platforms.push(packageFolder.value);
    }
  }

  return { kind: 'succeeded', value: { sdkRoot: sdkRoot, platforms: platforms } };
}
