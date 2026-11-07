import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { HomeRelativePathNames } from '../explorePlatform.js';
import type { ExploreProbePlatform } from '../exploreProbe.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreFileText, loadExploreRealPath } from '../loadExploreRead.js';
import type { ProjectPinsLoad } from '../projectPins/loadProjectPins.js';
import type { ProjectPinFile } from '../projectPins/projectPins.js';
import {
  parseAndroidLocalPropertiesSdkDir,
  parseFlutterSettingsAndroidSdk,
} from './parseAndroidSdkRootTexts.js';

/**
 * An SDK root the Android probes read; `isRequired` when a failed read of it fails the read of the
 * SDKs, as the platform's own SDK's does, rather than leaving its SDK out.
 */
export type AndroidSdkRoot = { path: AbsolutePath; isRequired: boolean };

/** A path that may name an SDK root, required as the root it names would be. */
type SdkRootCandidate = { text: string | null; isRequired: boolean };

/**
 * The SDK roots that exist, as named, one per real path, in order: the platform's SDK, the only
 * required one, the one Flutter's `android-sdk` setting names, then each `sdk.dir` of a
 * `local.properties` of `pinFiles`. A setting or a `local.properties` that cannot be read, names no
 * absolute path, or names one whose real path cannot be read adds none; only a failed read of the
 * platform's SDK fails.
 */
export async function loadAndroidSdkRoots(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  androidSdkRoot: HomeRelativePathNames;
  flutterSettingsPaths: HomeRelativePathNames[];
  pinFiles: ProjectPinFile[];
  privacyDenialCode: string | null;
}): Promise<Result<AndroidSdkRoot[], ExploreFileUnreadable>> {
  const flutterSdkRoot = await loadFlutterSettingsSdkRoot(params);
  const projectSdkRoots = params.pinFiles.flatMap((file) =>
    file.kind === 'androidLocalProperties' && file.content.kind === 'text'
      ? [parseAndroidLocalPropertiesSdkDir({ text: file.content.text })]
      : [],
  );
  const candidates: SdkRootCandidate[] = [
    {
      text: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeDir,
        names: params.androidSdkRoot,
      }),
      isRequired: true,
    },
    { text: flutterSdkRoot, isRequired: false },
    ...projectSdkRoots.map((text) => ({ text: text, isRequired: false })),
  ];
  const sdkRoots: AndroidSdkRoot[] = [];
  const sdkRealPaths: AbsolutePath[] = [];

  for (const candidateRoot of candidates) {
    const candidate = parseAbsolutePath({
      rules: params.pathRules,
      text: candidateRoot.text ?? '',
    });

    if (candidate.kind === 'failed') {
      continue;
    }

    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: candidate.value,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      if (candidateRoot.isRequired) {
        return realPath;
      }

      continue;
    }

    if (realPath.value !== null && !sdkRealPaths.includes(realPath.value)) {
      sdkRealPaths.push(realPath.value);
      sdkRoots.push({ path: candidate.value, isRequired: candidateRoot.isRequired });
    }
  }

  return { kind: 'succeeded', value: sdkRoots };
}

/**
 * `loadAndroidSdkRoots` with the places of a scan's platform, once its pins are read; pins that
 * could not be read leave the platform's and Flutter's roots alone. Never rejects.
 */
export async function loadScanAndroidSdkRoots(params: {
  environment: Environment;
  platform: ExploreProbePlatform;
  projectPins: ProjectPinsLoad;
}): Promise<Result<AndroidSdkRoot[], ExploreFileUnreadable>> {
  const pins = await params.projectPins.pins;

  return loadAndroidSdkRoots({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    androidSdkRoot: params.platform.explore.androidSdkRoot,
    flutterSettingsPaths: params.platform.explore.flutterSettingsPaths,
    pinFiles: pins.kind === 'succeeded' ? pins.value.files : [],
    privacyDenialCode: params.platform.privacyDenialCode,
  });
}

/**
 * The `android-sdk` of the first settings file that exists; `null` when none names one, or the
 * file cannot be read.
 */
async function loadFlutterSettingsSdkRoot(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  flutterSettingsPaths: HomeRelativePathNames[];
  privacyDenialCode: string | null;
}): Promise<string | null> {
  for (const settingsPathNames of params.flutterSettingsPaths) {
    const settings = await loadExploreFileText({
      path: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.homeDir,
        names: settingsPathNames,
      }),
      privacyDenialCode: params.privacyDenialCode,
    });

    if (settings.kind === 'failed') {
      return null;
    }

    switch (settings.value.kind) {
      case 'absent':
        continue;
      case 'unfit':
        return null;
      case 'text':
        return parseFlutterSettingsAndroidSdk({ text: settings.value.text });
    }
  }

  return null;
}
