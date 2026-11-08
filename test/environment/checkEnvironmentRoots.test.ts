import { describe, expect, test } from 'bun:test';
import { checkEnvironmentRoots } from '../../src/environment/checkEnvironmentRoots.js';
import type { EnvironmentFailure } from '../../src/environment/environmentPlatform.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { UserIdentity } from '../../src/system/userIdentity.js';
import { buildTestUserIdentity, buildTestWindowsUser } from '../support/parsedValueFixtures.js';

const user = buildTestUserIdentity({ uid: 501 });
const HOME = '/Users/tester';
const TEMP = '/private/var/folders/xy/abc/T';

const windowsUser = buildTestWindowsUser({ sidText: 'S-1-5-21-1000-2000-3000-1001' });
const WINDOWS_HOME = 'C:\\Users\\tester';
const WINDOWS_TEMP = 'C:\\Users\\tester\\AppData\\Local\\Temp';

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
  });
}

function checkOnWindows(params: {
  homeOwner?: UserIdentity;
  tempRealPath?: string;
}): EnvironmentFailure | null {
  return checkEnvironmentRoots({
    pathRules: WIN32_PATH_RULES,
    user: windowsUser,
    homeRealPath: WINDOWS_HOME,
    homeOwner: params.homeOwner ?? windowsUser,
    tempRealPath: params.tempRealPath ?? WINDOWS_TEMP,
    tempPlacement: 'belowHome',
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
});
