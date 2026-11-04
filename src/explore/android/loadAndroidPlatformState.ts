import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { HomeRelativePathNames } from '../explorePlatform.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
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
  pathRules: PathRules;
  homeDir: AbsolutePath;
  androidSdkRoot: HomeRelativePathNames;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPlatformState, ExploreFileUnreadable>> {
  const sdkRoot = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: params.androidSdkRoot,
  });
  const folderPaths = await loadAndroidChildPaths({
    pathRules: params.pathRules,
    parentPaths: [
      joinAbsolutePath({ rules: params.pathRules, parentPath: sdkRoot, names: ['platforms'] }),
    ],
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folderPaths.kind === 'failed') {
    return folderPaths;
  }

  const platforms = await loadAndroidPackageFolders({
    folderPaths: folderPaths.value,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (platforms.kind === 'failed') {
    return platforms;
  }

  return { kind: 'succeeded', value: { sdkRoot: sdkRoot, platforms: platforms.value } };
}
