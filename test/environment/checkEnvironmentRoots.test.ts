import { describe, expect, test } from 'bun:test';
import { checkEnvironmentRoots } from '../../src/environment/checkEnvironmentRoots.js';
import type { EnvironmentFailure } from '../../src/environment/environmentPlatform.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import {
  buildWin32Environment,
  checkWin32EnvironmentRoots,
} from '../../src/platform/win32/loadEnvironment.js';
import type { UserIdentity } from '../../src/system/userIdentity.js';
import { exampleWin32EnvironmentParams } from '../support/environmentFixtures.js';
import {
  buildTestUserIdentity,
  buildTestWindowsPath,
  buildTestWindowsUser,
  exampleWindowsUser,
} from '../support/parsedValueFixtures.js';

const user = buildTestUserIdentity({ uid: 501 });
const HOME = '/Users/tester';
const TEMP = '/private/var/folders/xy/abc/T';

const WINDOWS_HOME = 'C:\\Users\\tester';
const WINDOWS_TEMP = 'C:\\Users\\tester\\AppData\\Local\\Temp';
const WINDOWS_DOCUMENTS = 'D:\\Documents';
const windowsProtectedRealPaths = [
  'C:\\',
  'D:\\',
  WINDOWS_HOME,
  'C:\\Users\\tester\\AppData\\Local',
  WINDOWS_DOCUMENTS,
];

function check(params: {
  user?: UserIdentity;
  homeRealPath?: string;
  homeOwner?: UserIdentity;
  tempRealPath?: string;
}): EnvironmentFailure | null {
  return checkEnvironmentRoots({
    pathRules: POSIX_PATH_RULES,
    user: params.user ?? user,
    homeRealPath: params.homeRealPath ?? HOME,
    homeOwner: params.homeOwner ?? user,
    tempRealPath: params.tempRealPath ?? TEMP,
    tempPlacement: 'apartFromHome',
    protectedRealPaths: [],
  });
}

/**
 * The check on the protected folders as an environment lists them: with the entry the temporary
 * folder adds for itself.
 */
function checkOnWindows(params: {
  homeOwner?: UserIdentity;
  tempRealPath?: string;
}): EnvironmentFailure | null {
  return checkEnvironmentRoots({
    pathRules: WIN32_PATH_RULES,
    user: exampleWindowsUser,
    homeRealPath: WINDOWS_HOME,
    homeOwner: params.homeOwner ?? exampleWindowsUser,
    tempRealPath: params.tempRealPath ?? WINDOWS_TEMP,
    tempPlacement: 'belowHome',
    protectedRealPaths: [...windowsProtectedRealPaths, params.tempRealPath ?? WINDOWS_TEMP],
  });
}

/** The check as Windows runs it: on the protected list of the environment built for `temp`. */
function checkWin32Environment(params: {
  temp: { path: AbsolutePath; realPath: AbsolutePath };
  oneDriveRealPaths: AbsolutePath[];
}): EnvironmentFailure | null {
  const environment = buildWin32Environment({
    ...exampleWin32EnvironmentParams,
    temp: params.temp,
    oneDriveRealPaths: params.oneDriveRealPaths,
  });

  return checkWin32EnvironmentRoots({
    environment: environment,
    homeRealPath: exampleWin32EnvironmentParams.home.realPath,
    homeOwner: exampleWin32EnvironmentParams.user,
    tempRealPath: params.temp.realPath,
  });
}

describe('checkEnvironmentRoots', () => {
  test('accepts an own home and the per-user temporary folder', () => {
    expect(check({})).toBeNull();
  });

  test('refuses root', () => {
    const root = buildTestUserIdentity({ uid: 0 });

    expect(check({ user: root, homeOwner: root })).toEqual({ reason: 'runAsRoot' });
  });

  test('refuses a home folder that belongs to someone else, such as the disk root', () => {
    expect(check({ homeRealPath: '/', homeOwner: buildTestUserIdentity({ uid: 0 }) })).toEqual({
      reason: 'homeNotOwned',
      path: '/',
    });
    expect(
      check({ homeRealPath: '/Users/other', homeOwner: buildTestUserIdentity({ uid: 502 }) }),
    ).toEqual({
      reason: 'homeNotOwned',
      path: '/Users/other',
    });
  });

  test('refuses a temporary folder that is the home, holds it, or lies in it', () => {
    for (const tempRealPath of [HOME, '/Users', '/', `${HOME}/tmp`, '/users/TESTER/Downloads']) {
      expect(check({ tempRealPath: tempRealPath })).toEqual({
        reason: 'tempOverlapsHome',
        path: tempRealPath,
      });
    }
  });

  test('accepts a temporary folder whose name only starts like the home', () => {
    expect(check({ tempRealPath: '/Users/tester-tmp' })).toBeNull();
  });
});

describe('checkEnvironmentRoots on Windows', () => {
  test('accepts an own profile and the temporary folder below its LocalAppData', () => {
    expect(checkOnWindows({})).toBeNull();
  });

  test('refuses a profile that another account owns, such as the Administrators group', () => {
    expect(
      checkOnWindows({ homeOwner: buildTestWindowsUser({ sidText: 'S-1-5-32-544' }) }),
    ).toEqual({ reason: 'profileNotOwned', path: WINDOWS_HOME });
  });

  test('refuses a temporary folder that is the profile or holds it, in any case', () => {
    for (const tempRealPath of [WINDOWS_HOME, 'c:\\users\\TESTER', 'C:\\Users', 'C:\\']) {
      expect(checkOnWindows({ tempRealPath: tempRealPath })).toEqual({
        reason: 'tempOverlapsHome',
        path: tempRealPath,
      });
    }
  });

  test('refuses a temporary folder that is a fixed drive root', () => {
    expect(checkOnWindows({ tempRealPath: 'd:\\' })).toEqual({
      reason: 'tempHoldsProtectedFolder',
      path: 'd:\\',
    });
  });

  test('refuses a temporary folder that is the root of a drive that is not fixed', () => {
    expect(checkOnWindows({ tempRealPath: 'E:\\' })).toEqual({
      reason: 'tempHoldsProtectedFolder',
      path: 'E:\\',
    });
  });

  test('refuses a temporary folder that is a protected folder or holds one', () => {
    for (const tempRealPath of [WINDOWS_DOCUMENTS, 'd:\\documents', 'C:\\Users\\tester\\AppData']) {
      expect(checkOnWindows({ tempRealPath: tempRealPath })).toEqual({
        reason: 'tempHoldsProtectedFolder',
        path: tempRealPath,
      });
    }
  });

  test('accepts a temporary folder below a protected folder', () => {
    expect(checkOnWindows({ tempRealPath: 'D:\\Documents\\Temp' })).toBeNull();
  });
});

describe('checkEnvironmentRoots on the protected list of the Windows environment', () => {
  test('accepts the temporary folder, whose own entry the list holds', () => {
    expect(
      checkWin32Environment({
        temp: exampleWin32EnvironmentParams.temp,
        oneDriveRealPaths: exampleWin32EnvironmentParams.oneDriveRealPaths,
      }),
    ).toBeNull();
  });

  test('refuses a temporary folder that is a OneDrive root too, which the list holds twice', () => {
    const oneDriveRoot = buildTestWindowsPath({ text: 'D:\\OneDrive' });

    expect(
      checkWin32Environment({
        temp: { path: oneDriveRoot, realPath: oneDriveRoot },
        oneDriveRealPaths: [oneDriveRoot],
      }),
    ).toEqual({ reason: 'tempHoldsProtectedFolder', path: 'D:\\OneDrive' });
  });
});
