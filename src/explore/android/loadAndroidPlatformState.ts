import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { ANDROID_SDK_PATH_NAMES } from './androidSdkRoot.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidChildPaths, loadAndroidPackageFolders } from './loadAndroidPackageFolder.js';

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
  const folderPaths = await loadAndroidChildPaths({
    parentPaths: [joinAbsolutePath({ parentPath: sdkRoot, names: ['platforms'] })],
  });

  if (folderPaths.kind === 'failed') {
    return folderPaths;
  }

  const platforms = await loadAndroidPackageFolders({ folderPaths: folderPaths.value });

  if (platforms.kind === 'failed') {
    return platforms;
  }

  return { kind: 'succeeded', value: { sdkRoot: sdkRoot, platforms: platforms.value } };
}
