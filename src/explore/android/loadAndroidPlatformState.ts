import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type { AndroidPackageFolder } from './loadAndroidPackageFolder.js';
import { loadAndroidChildPaths, loadAndroidPackageFolders } from './loadAndroidPackageFolder.js';

/** The platform folders of one SDK that hold a `package.xml`; none without `platforms`. */
export type AndroidPlatformSdk = {
  sdkRoot: AbsolutePath;
  platforms: AndroidPackageFolder[];
};

/** The platform folders of each SDK root, in the roots' order. */
export type AndroidPlatformState = { sdks: AndroidPlatformSdk[] };

/**
 * Reads `<sdk>/platforms/*` of each root, for the platform probe and the recheck of its units
 * alone, so a failed read fails neither the AVD, system image, nor emulator probe.
 */
export async function loadAndroidPlatformState(params: {
  pathRules: PathRules;
  sdkRoots: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AndroidPlatformState, ExploreFileUnreadable>> {
  const sdks: AndroidPlatformSdk[] = [];

  for (const sdkRoot of params.sdkRoots) {
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

    sdks.push({ sdkRoot: sdkRoot, platforms: platforms.value });
  }

  return { kind: 'succeeded', value: { sdks: sdks } };
}
