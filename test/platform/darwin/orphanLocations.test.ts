import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import type { OrphanNameMatch } from '../../../src/scan/decideOrphanCandidate.js';
import {
  buildOrphanInstalledFacts,
  matchOrphanName,
} from '../../../src/scan/decideOrphanCandidate.js';
import type { OrphanLocation } from '../../../src/scan/scanPlatform.js';
import { buildTestInstalledApp } from '../../support/installedAppFixtures.js';

const installed = buildOrphanInstalledFacts({
  apps: [
    buildTestInstalledApp({
      bundlePath: '/Applications/Visual Studio Code.app',
      displayName: 'Visual Studio Code',
      bundleId: 'com.microsoft.VSCode',
    }),
  ],
  applicationDirs: ['/Applications'],
  isComplete: true,
});

function getLocation(params: { lastName: string }): OrphanLocation {
  const apps = darwinPlatform.scan.apps;

  if (apps.appSection !== 'offerUnusedApps') {
    throw new Error('The apps of macOS offer no unused apps.');
  }

  const location = apps.orphanLocations.find(
    (candidate) => candidate.pathNames.at(-1) === params.lastName,
  );

  if (location === undefined) {
    throw new Error(`No orphan location ends in ${params.lastName}.`);
  }

  return location;
}

function matchNameIn(params: { name: string; lastName: string }): OrphanNameMatch {
  return matchOrphanName({
    name: params.name,
    location: getLocation({ lastName: params.lastName }),
    installed: installed,
  });
}

describe('the orphan locations of macOS', () => {
  test.each(['HTTPStorages', 'WebKit'])(
    'match a bundle id of no installed app in %s, and skip a plain name',
    (lastName) => {
      expect(matchNameIn({ name: 'com.example.removed', lastName: lastName })).toEqual({
        kind: 'match',
        matchedBy: 'bundleId',
      });
      expect(matchNameIn({ name: 'Removed Tool', lastName: lastName })).toEqual({
        kind: 'skip',
        reason: 'notBundleId',
      });
    },
  );

  test('skip the folders of macOS and its daemons in Application Support', () => {
    expect(matchNameIn({ name: 'MobileSync', lastName: 'Application Support' })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(matchNameIn({ name: 'rapportd', lastName: 'Application Support' })).toMatchObject({
      reason: 'systemOwned',
    });
  });

  test('skip a maker or a part any app may have in Application Support', () => {
    expect(matchNameIn({ name: 'Google', lastName: 'Application Support' })).toMatchObject({
      reason: 'genericName',
    });
    expect(matchNameIn({ name: 'CrashPad', lastName: 'Application Support' })).toMatchObject({
      reason: 'genericName',
    });
  });

  test('judge a sandbox in Containers as one app, and a cache as its vendor', () => {
    expect(matchNameIn({ name: 'com.microsoft.Word', lastName: 'Containers' })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
    expect(matchNameIn({ name: 'com.microsoft.Word', lastName: 'Caches' })).toMatchObject({
      reason: 'ownerInstalled',
    });
  });

  test('read the bundle id before the suffix of saved windows', () => {
    expect(
      matchNameIn({ name: 'org.removed.tool.savedState', lastName: 'Saved Application State' }),
    ).toEqual({ kind: 'match', matchedBy: 'bundleId' });
  });
});
