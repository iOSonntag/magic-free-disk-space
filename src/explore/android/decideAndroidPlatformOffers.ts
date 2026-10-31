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
  toolPins: ToolPins;
}): AndroidPlatformOffers {
  const compileSdkPins = decideAndroidCompileSdkPins({ toolPins: params.toolPins });
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

    if (!isAndroidPlatformPinned({ compileSdkPins: compileSdkPins, apiLevel: apiLevel })) {
      offers.push({
        sdkRoot: params.state.sdkRoot,
        folderPath: platform.folderPath,
        apiLevel: apiLevel,
      });
    }
  }

  return { offers: offers, isComplete: isComplete };
}

function decideAndroidCompileSdkPins(params: { toolPins: ToolPins }): AndroidCompileSdkPins {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return { kind: 'everyPlatform' };
    case 'texts':
      return parseAndroidCompileSdkPins({ files: params.toolPins.files });
  }
}

function isAndroidPlatformPinned(params: {
  compileSdkPins: AndroidCompileSdkPins;
  apiLevel: number;
}): boolean {
  switch (params.compileSdkPins.kind) {
    case 'everyPlatform':
      return true;
    case 'apiLevels':
      return params.compileSdkPins.apiLevels.has(params.apiLevel);
  }
}

function parseAndroidPlatformApiLevel(params: { packagePath: string }): number | null {
  const match = PLATFORM_PACKAGE_PATH_PATTERN.exec(params.packagePath);

  if (match === null) {
    return null;
  }

  return Number(match[1]);
}
