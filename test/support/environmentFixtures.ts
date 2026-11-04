import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildWin32Environment } from '../../src/platform/win32/loadEnvironment.js';
import { buildTestMacEnvironment } from './fixtureRoot.js';
import { buildTestWindowsPath, buildTestWindowsUser } from './parsedValueFixtures.js';

/** The values a Windows environment is built of, for a test that varies one of them. */
export type Win32EnvironmentParams = Parameters<typeof buildWin32Environment>[0];

/** A macOS environment of example paths below `/Users/tester`, the same on every host. */
export const EXAMPLE_DARWIN_ENVIRONMENT: Environment = buildTestMacEnvironment();

/**
 * The values of a Windows environment of example paths below `C:\Users\tester`, the same on every
 * host: Documents moved into OneDrive, as Known Folder Move does, and no Videos folder.
 */
export const EXAMPLE_WIN32_ENVIRONMENT_PARAMS: Win32EnvironmentParams = {
  nowMs: 0,
  user: buildTestWindowsUser({ sidText: 'S-1-5-21-1000-2000-3000-1001' }),
  home: {
    path: buildTestWindowsPath({ text: 'C:\\Users\\tester' }),
    realPath: buildTestWindowsPath({ text: 'C:\\Users\\tester' }),
  },
  temp: {
    path: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local\\Temp' }),
    realPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local\\Temp' }),
  },
  localAppData: {
    path: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local' }),
    realPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local' }),
  },
  roamingAppData: {
    path: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Roaming' }),
    realPath: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Roaming' }),
  },
  knownFolderPaths: {
    desktop: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Desktop' }),
    documents: buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive\\Documents' }),
    downloads: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Downloads' }),
    videos: null,
    music: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Music' }),
    pictures: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Pictures' }),
    localAppDataLow: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\LocalLow' }),
    skyDrive: buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive' }),
  },
  fixedDriveRoots: [buildTestWindowsPath({ text: 'C:\\' }), buildTestWindowsPath({ text: 'D:\\' })],
  protectedFolderRealPaths: [buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive' })],
};

/** The Windows environment of `EXAMPLE_WIN32_ENVIRONMENT_PARAMS`. */
export const EXAMPLE_WIN32_ENVIRONMENT: Environment = buildWin32Environment(
  EXAMPLE_WIN32_ENVIRONMENT_PARAMS,
);
