import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidChildPaths, loadAndroidPackageFolders } from './loadAndroidPackageFolder.js';
import type { AndroidSdkRoot } from './loadAndroidSdkRoots.js';
import { loadEachAndroidSdkRoot } from './loadAndroidSdkRoots.js';

/** The platform folders of one SDK that hold a `package.xml`; none without `platforms`. */
export type AndroidPlatformSdk = {
  sdkRoot: AbsolutePath;
  platforms: AndroidPackageFolder[];
};

/** The platform folders of each SDK root, in the roots' order. */
export type AndroidPlatformState = { sdks: AndroidPlatformSdk[] };

/**
 * Reads `<sdk>/platforms/*` of each root, for the platform probe and the recheck of its units
 * alone, so a failed read fails neither the AVD, system image, nor emulator probe. A failed read
 * in a root that is not required leaves only that root's SDK out.
 */
export async function loadAndroidPlatformState(params: {
  pathRules: PathRules;
  sdkRoots: AndroidSdkRoot[];
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPlatformState, ExploreFileUnreadable>> {
  const sdks = await loadEachAndroidSdkRoot({
    roots: params.sdkRoots,
    loadRoot: (sdkRoot) =>
      loadAndroidPlatformSdk({
        pathRules: params.pathRules,
        sdkRoot: sdkRoot.path,
        privacyDenialCode: params.privacyDenialCode,
      }),
  });

  if (sdks.kind === 'failed') {
    return sdks;
  }

  return { kind: 'succeeded', value: { sdks: sdks.value } };
}

async function loadAndroidPlatformSdk(params: {
  pathRules: PathRules;
  sdkRoot: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPlatformSdk, ExploreFileUnreadable>> {
  const folderPaths = await loadAndroidChildPaths({
    pathRules: params.pathRules,
    parentPaths: [
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.sdkRoot,
        names: ['platforms'],
      }),
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

  return { kind: 'succeeded', value: { sdkRoot: params.sdkRoot, platforms: platforms.value } };
}
