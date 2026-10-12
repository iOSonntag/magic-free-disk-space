import { describe, expect, test } from 'bun:test';
import { checkEnvironmentRoots } from '../../src/environment/checkEnvironmentRoots.js';

const USER_ID = 501;
const HOME = '/Users/tester';
const TEMP = '/private/var/folders/xy/abc/T';

function check(params: {
  userId?: number;
  homeRealPath?: string;
  homeOwnerId?: number;
  tempRealPath?: string;
}) {
  return checkEnvironmentRoots({
    userId: params.userId ?? USER_ID,
    homeRealPath: params.homeRealPath ?? HOME,
    homeOwnerId: params.homeOwnerId ?? USER_ID,
    tempRealPath: params.tempRealPath ?? TEMP,
  });
}

describe('checkEnvironmentRoots', () => {
  test('accepts an own home and the per-user temporary folder', () => {
    expect(check({})).toBeNull();
  });

  test('refuses root', () => {
    expect(check({ userId: 0, homeOwnerId: 0 })).toEqual({ reason: 'runAsRoot' });
  });

  test('refuses a home folder that belongs to someone else, such as the disk root', () => {
    expect(check({ homeRealPath: '/', homeOwnerId: 0 })).toEqual({
      reason: 'homeNotOwned',
      path: '/',
    });
    expect(check({ homeRealPath: '/Users/other', homeOwnerId: 502 })).toEqual({
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
