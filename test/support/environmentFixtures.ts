import type {
  Environment,
  WindowsKnownFolderPaths,
} from '../../src/environment/buildEnvironment.js';
import type { Win32EnvironmentValues } from '../../src/platform/win32/loadEnvironment.js';
import { buildWin32Environment } from '../../src/platform/win32/loadEnvironment.js';
import { buildTestMacEnvironment } from './fixtureRoot.js';
import {
  buildTestDriveRoot,
  buildTestWindowsPath,
  exampleWindowsUser,
} from './parsedValueFixtures.js';

/** A macOS environment of example paths below `/Users/tester`, the same on every host. */
export const exampleDarwinEnvironment: Environment = buildTestMacEnvironment();

/** The known folders of the example Windows environment, each its own real path. */
const exampleWin32KnownFolderPaths: WindowsKnownFolderPaths = {
  desktop: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Desktop' }),
  documents: buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive\\Documents' }),
  downloads: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Downloads' }),
  videos: null,
  music: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Music' }),
  pictures: buildTestWindowsPath({ text: 'C:\\Users\\tester\\Pictures' }),
  localAppDataLow: buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\LocalLow' }),
  skyDrive: buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive' }),
};

/**
 * The values of a Windows environment of example paths below `C:\Users\tester`, the same on every
 * host: Documents moved into OneDrive, as Known Folder Move does, and no Videos folder.
 */
export const exampleWin32EnvironmentParams: Win32EnvironmentValues = {
  nowMs: 0,
  user: exampleWindowsUser,
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
  knownFolderPaths: exampleWin32KnownFolderPaths,
  knownFolderRealPaths: exampleWin32KnownFolderPaths,
  fixedDriveRoots: [buildTestDriveRoot({ text: 'C:\\' }), buildTestDriveRoot({ text: 'D:\\' })],
  oneDriveRealPaths: [buildTestWindowsPath({ text: 'C:\\Users\\tester\\OneDrive' })],
};

/** The Windows environment of `exampleWin32EnvironmentParams`. */
export const exampleWin32Environment: Environment = buildWin32Environment(
  exampleWin32EnvironmentParams,
);
