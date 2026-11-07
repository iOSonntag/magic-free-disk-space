import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidChildPaths, loadAndroidPackageFolders } from './loadAndroidPackageFolder.js';
import type { AndroidSdkRoot } from './loadAndroidSdkRoots.js';

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
  const sdks: AndroidPlatformSdk[] = [];

  for (const sdkRoot of params.sdkRoots) {
    const platforms = await loadAndroidSdkPlatforms({
      pathRules: params.pathRules,
      sdkRoot: sdkRoot.path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (platforms.kind === 'failed') {
      if (sdkRoot.isRequired) {
        return platforms;
      }

      continue;
    }

    sdks.push({ sdkRoot: sdkRoot.path, platforms: platforms.value });
  }

  return { kind: 'succeeded', value: { sdks: sdks } };
}

async function loadAndroidSdkPlatforms(params: {
  pathRules: PathRules;
  sdkRoot: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPackageFolder[], ExploreFileUnreadable>> {
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

  return loadAndroidPackageFolders({
    folderPaths: folderPaths.value,
    privacyDenialCode: params.privacyDenialCode,
  });
}
