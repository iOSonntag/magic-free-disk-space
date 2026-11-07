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
 * A path that may name an SDK root; `isRequired` when its failed read fails the probe, as the
 * platform's own SDK's does, rather than adding none.
 */
type SdkRootCandidate = { text: string | null; isRequired: boolean };

/**
 * The SDK roots that exist, as named, one per real path, in order: the platform's SDK, the one Flutter's
 * `android-sdk` setting names, then each `sdk.dir` of a found `local.properties`. A setting or a
 * `local.properties` that cannot be read, names no absolute path, or names one whose real path
 * cannot be read adds none; only a failed read of the platform's SDK fails.
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
  const projectSdkRoots = params.projectPins.files.flatMap((file) =>
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
  const sdkRoots: AbsolutePath[] = [];
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
