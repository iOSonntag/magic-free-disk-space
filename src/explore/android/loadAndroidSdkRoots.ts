import type { CatalogLocation } from '../../catalog/catalog.js';
import { resolveCatalogLocation } from '../../catalog/resolveCatalogLocation.js';
import type { Environment } from '../../environment/buildEnvironment.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
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

/** The root a candidate names, with the real path that tells two names of one SDK apart. */
type SdkRootResolved = { sdkRoot: AndroidSdkRoot; realPath: AbsolutePath };

/**
 * What `loadRoot` gives of each root, in the roots' order, less a `null`. A failed load fails all
 * in a required root, and leaves only its own root out in any other.
 */
export async function loadEachAndroidSdkRoot<
  TRoot extends { isRequired: boolean },
  TValue,
>(params: {
  roots: TRoot[];
  loadRoot: (root: TRoot) => Promise<Result<TValue | null, ExploreFileUnreadable>>;
}): Promise<Result<TValue[], ExploreFileUnreadable>> {
  const values: TValue[] = [];

  for (const root of params.roots) {
    const loaded = await params.loadRoot(root);

    if (loaded.kind === 'failed') {
      if (root.isRequired) {
        return loaded;
      }

      continue;
    }

    if (loaded.value !== null) {
      values.push(loaded.value);
    }
  }

  return { kind: 'succeeded', value: values };
}

/**
 * The SDK roots that exist, as named, one per real path, in order: the platform's SDK, the only
 * required one, the one Flutter's `android-sdk` setting names, then each `sdk.dir` of a
 * `local.properties` of `pinFiles`. A setting or a `local.properties` that cannot be read, names no
 * absolute path, or names one whose real path cannot be read adds none; only a failed read of the
 * platform's SDK fails.
 */
export async function loadAndroidSdkRoots(params: {
  environment: Environment;
  androidSdkRoot: CatalogLocation;
  flutterSettingsPaths: CatalogLocation[];
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
      text: resolveCatalogLocation({
        environment: params.environment,
        location: params.androidSdkRoot,
      }),
      isRequired: true,
    },
    { text: flutterSdkRoot, isRequired: false },
    ...projectSdkRoots.map((text) => ({ text: text, isRequired: false })),
  ];
  const resolvedRoots = await loadEachAndroidSdkRoot({
    roots: candidates,
    loadRoot: (candidate) =>
      loadSdkRootResolved({
        pathRules: params.environment.pathRules,
        candidate: candidate,
        privacyDenialCode: params.privacyDenialCode,
      }),
  });

  if (resolvedRoots.kind === 'failed') {
    return resolvedRoots;
  }

  const uniqueRoots = resolvedRoots.value.filter(
    (root, index) =>
      resolvedRoots.value.findIndex((other) => other.realPath === root.realPath) === index,
  );

  return { kind: 'succeeded', value: uniqueRoots.map((root) => root.sdkRoot) };
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
    environment: params.environment,
    androidSdkRoot: params.platform.explore.androidSdkRoot,
    flutterSettingsPaths: params.platform.explore.flutterSettingsPaths,
    pinFiles: pins.kind === 'succeeded' ? pins.value.files : [],
    privacyDenialCode: params.platform.privacyDenialCode,
  });
}

/** The root the candidate names; `null` when it names no absolute path, or nothing is there. */
async function loadSdkRootResolved(params: {
  pathRules: PathRules;
  candidate: SdkRootCandidate;
  privacyDenialCode: string | null;
}): Promise<Result<SdkRootResolved | null, ExploreFileUnreadable>> {
  const path = parseAbsolutePath({ rules: params.pathRules, text: params.candidate.text ?? '' });

  if (path.kind === 'failed') {
    return { kind: 'succeeded', value: null };
  }

  const realPath = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: path.value,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (realPath.kind === 'failed') {
    return realPath;
  }

  if (realPath.value === null) {
    return { kind: 'succeeded', value: null };
  }

  return {
    kind: 'succeeded',
    value: {
      sdkRoot: { path: path.value, isRequired: params.candidate.isRequired },
      realPath: realPath.value,
    },
  };
}

/**
 * The `android-sdk` of the first settings file that exists; `null` when none names one, or the
 * file cannot be read.
 */
async function loadFlutterSettingsSdkRoot(params: {
  environment: Environment;
  flutterSettingsPaths: CatalogLocation[];
  privacyDenialCode: string | null;
}): Promise<string | null> {
  for (const settingsPath of params.flutterSettingsPaths) {
    const settings = await loadExploreFileText({
      path: resolveCatalogLocation({ environment: params.environment, location: settingsPath }),
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
