import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { AndroidPlatformState } from './loadAndroidPlatformState.js';
import type { AndroidCompileSdkPins } from './parseAndroidCompileSdkPins.js';
import { parseAndroidCompileSdkPins } from './parseAndroidCompileSdkPins.js';

/** A platform folder `platforms;android-<apiLevel>` that no Gradle file found compiles against. */
export type AndroidPlatformOffer = {
  sdkRoot: AbsolutePath;
  folderPath: AbsolutePath;
  apiLevel: number;
};

/** What the platform probe offers; `isComplete` is false when it could not judge some folders. */
export type AndroidPlatformOffers = { offers: AndroidPlatformOffer[]; isComplete: boolean };

const PLATFORM_PACKAGE_PATH_PATTERN = /^platforms;android-([1-9][0-9]*)$/;

/**
 * The platform folders no Gradle file pins, at the scan and at the recheck alike. Any other folder,
 * such as an extension platform, a preview, or an unparsed `package.xml`, is not judged.
 */
export function decideAndroidPlatformOffers(params: {
  state: AndroidPlatformState;
  pins: ToolPins;
}): AndroidPlatformOffers {
  const compileSdkPins = decideAndroidCompileSdkPins({ pins: params.pins });

  switch (compileSdkPins.kind) {
    case 'everyPlatform':
      return { offers: [], isComplete: true };
    case 'apiLevels':
      break;
  }

  const offers: AndroidPlatformOffer[] = [];
  let isComplete = true;

  for (const platform of params.state.platforms) {
    const apiLevel =
      platform.kind === 'parsed'
        ? parseAndroidPlatformApiLevel({ packagePath: platform.packagePath })
        : null;

    if (apiLevel === null) {
      isComplete = false;
      continue;
    }

    if (!compileSdkPins.apiLevels.has(apiLevel)) {
      offers.push({
        sdkRoot: params.state.sdkRoot,
        folderPath: platform.folderPath,
        apiLevel: apiLevel,
      });
    }
  }

  return { offers: offers, isComplete: isComplete };
}

function decideAndroidCompileSdkPins(params: { pins: ToolPins }): AndroidCompileSdkPins {
  switch (params.pins.kind) {
    case 'everyVersionPinned':
      return { kind: 'everyPlatform' };
    case 'texts':
      return parseAndroidCompileSdkPins({ files: params.pins.files });
  }
}

function parseAndroidPlatformApiLevel(params: { packagePath: string }): number | null {
  const match = PLATFORM_PACKAGE_PATH_PATTERN.exec(params.packagePath);

  if (match === null) {
    return null;
  }

  return Number(match[1]);
}
