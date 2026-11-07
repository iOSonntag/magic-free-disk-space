import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { HomeRelativePathNames } from '../explorePlatform.js';
import type { ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreFileText, loadExploreRealPath } from '../loadExploreRead.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import {
  parseAndroidLocalPropertiesSdkDir,
  parseFlutterSettingsAndroidSdk,
} from './parseAndroidSdkRootTexts.js';

/**
 * The SDK roots that exist, as named, one per real path, in order: the platform's SDK, the one Flutter's
 * `android-sdk` setting names, then each `sdk.dir` of a found `local.properties`. A setting or a
 * `local.properties` that cannot be read or names no absolute path adds none.
 */
export async function loadAndroidSdkRoots(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  androidSdkRoot: HomeRelativePathNames;
  flutterSettingsPaths: HomeRelativePathNames[];
  projectPins: ProjectPins;
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const flutterSdkRoot = await loadFlutterSettingsSdkRoot(params);

  if (flutterSdkRoot.kind === 'failed') {
    return flutterSdkRoot;
  }

  const projectSdkRoots = params.projectPins.files.flatMap((file) =>
    file.kind === 'androidLocalProperties' && file.content.kind === 'text'
      ? [parseAndroidLocalPropertiesSdkDir({ text: file.content.text })]
      : [],
  );
  const candidateTexts = [
    joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.homeDir,
      names: params.androidSdkRoot,
    }),
    flutterSdkRoot.value,
    ...projectSdkRoots,
  ];
  const sdkRoots: AbsolutePath[] = [];
  const sdkRealPaths: AbsolutePath[] = [];

  for (const candidateText of candidateTexts) {
    const candidate = parseAbsolutePath({ rules: params.pathRules, text: candidateText ?? '' });

    if (candidate.kind === 'failed') {
      continue;
    }

    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: candidate.value,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      return realPath;
    }

    if (realPath.value !== null && !sdkRealPaths.includes(realPath.value)) {
      sdkRealPaths.push(realPath.value);
      sdkRoots.push(candidate.value);
    }
  }

  return { kind: 'succeeded', value: sdkRoots };
}

/** `loadAndroidSdkRoots` with the places of the probe's platform. */
export function loadAndroidProbeSdkRoots(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  return loadAndroidSdkRoots({
    pathRules: params.run.environment.pathRules,
    homeDir: params.run.environment.homeDir,
    androidSdkRoot: params.run.platform.explore.androidSdkRoot,
    flutterSettingsPaths: params.run.platform.explore.flutterSettingsPaths,
    projectPins: params.projectPins,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });
}

/** The `android-sdk` of the first settings file that exists; `null` when none names one. */
async function loadFlutterSettingsSdkRoot(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  flutterSettingsPaths: HomeRelativePathNames[];
  privacyDenialCode: string | null;
}): Promise<Result<string | null, ExploreFileUnreadable>> {
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
      return settings;
    }

    switch (settings.value.kind) {
      case 'absent':
        continue;
      case 'unfit':
        return { kind: 'succeeded', value: null };
      case 'text':
        return {
          kind: 'succeeded',
          value: parseFlutterSettingsAndroidSdk({ text: settings.value.text }),
        };
    }
  }

  return { kind: 'succeeded', value: null };
}
