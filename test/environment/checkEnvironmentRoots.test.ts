import { describe, expect, test } from 'bun:test';
import { checkEnvironmentRoots } from '../../src/environment/checkEnvironmentRoots.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { UserIdentity } from '../../src/system/userIdentity.js';
import { buildTestUserIdentity, buildTestWindowsUser } from '../support/parsedValueFixtures.js';

const USER = buildTestUserIdentity({ uid: 501 });
const HOME = '/Users/tester';
const TEMP = '/private/var/folders/xy/abc/T';

const WINDOWS_USER = buildTestWindowsUser({ sidText: 'S-1-5-21-1000-2000-3000-1001' });
const WINDOWS_HOME = 'C:\\Users\\tester';
const WINDOWS_TEMP = 'C:\\Users\\tester\\AppData\\Local\\Temp';

function check(params: {
  user?: UserIdentity;
  homeRealPath?: string;
  homeOwner?: UserIdentity;
  tempRealPath?: string;
}) {
  return checkEnvironmentRoots({
    pathRules: DARWIN_PATH_RULES,
    user: params.user ?? USER,
    homeRealPath: params.homeRealPath ?? HOME,
    homeOwner: params.homeOwner ?? USER,
    tempRealPath: params.tempRealPath ?? TEMP,
    tempPlacement: 'apartFromHome',
  });
}

function checkOnWindows(params: { homeOwner?: UserIdentity; tempRealPath?: string }) {
  return checkEnvironmentRoots({
    pathRules: WIN32_PATH_RULES,
    user: WINDOWS_USER,
    homeRealPath: WINDOWS_HOME,
    homeOwner: params.homeOwner ?? WINDOWS_USER,
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
