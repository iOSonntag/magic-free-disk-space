import { expect, test } from 'bun:test';
import { ORPHAN_LOCATIONS } from '../../src/platform/darwin/orphanLocations.js';
import type { LeftoverMatch } from '../../src/scan/candidateOrigin.js';
import type { OrphanInstalledFacts } from '../../src/scan/decideOrphanCandidate.js';
import {
  buildOrphanInstalledFacts,
  decideOrphanCandidate,
  isOrphanNameSkipReported,
  matchOrphanName,
} from '../../src/scan/decideOrphanCandidate.js';
import type { OrphanLocation } from '../../src/scan/scanPlatform.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';

const MIB = 1_048_576;
const UNUSED_CUTOFF_MS = 1_650_000_000_000;

function findLocation(params: { lastName: string }): OrphanLocation {
  const location = ORPHAN_LOCATIONS.find(
    (candidate) => candidate.pathNames[candidate.pathNames.length - 1] === params.lastName,
  );

  if (location === undefined) {
    throw new Error(`No orphan location ends in ${params.lastName}.`);
  }

  return location;
}

const CONTAINERS = findLocation({ lastName: 'Containers' });
const GROUP_CONTAINERS = findLocation({ lastName: 'Group Containers' });
const APPLICATION_SUPPORT = findLocation({ lastName: 'Application Support' });
const CACHES = findLocation({ lastName: 'Caches' });
const SAVED_STATE = findLocation({ lastName: 'Saved Application State' });

function buildInstalled(params: { isComplete?: boolean | undefined }): OrphanInstalledFacts {
  return buildOrphanInstalledFacts({
    apps: [
      buildTestInstalledApp({
        bundlePath: '/Applications/Example.app',
        displayName: 'Example',
        bundleId: 'com.example.installed',
      }),
      buildTestInstalledApp({
        bundlePath: '/Applications/Visual Studio Code.app',
        displayName: 'Visual Studio Code',
        bundleId: 'com.microsoft.VSCode',
      }),
      buildTestInstalledApp({
        bundlePath: '/Applications/Brave Browser.app',
        displayName: 'Brave Browser',
        bundleId: 'com.brave.Browser',
      }),
      buildTestInstalledApp({
        bundlePath: '/Applications/Affinity/Designer.app',
        displayName: 'Designer',
        bundleId: 'com.seriflabs.affinitydesigner2',
      }),
    ],
    applicationDirs: ['/Applications'],
    isComplete: params.isComplete ?? true,
  });
}

function match(params: { name: string; location: OrphanLocation; isComplete?: boolean }) {
  return matchOrphanName({
    name: params.name,
    location: params.location,
    installed: buildInstalled({ isComplete: params.isComplete }),
  });
}

function decide(params: {
  name: string;
  matchedBy?: LeftoverMatch;
  location?: OrphanLocation;
  allocatedBytes?: number;
  kind?: FileKind;
  isComplete?: boolean;
  latestModifiedMs?: number;
}) {
  const path = `/home/Library/Containers/${params.name}`;

  return decideOrphanCandidate({
    path: path,
    name: params.name,
    matchedBy: params.matchedBy ?? 'bundleId',
    location: params.location ?? CONTAINERS,
    measurement: buildTestMeasurement({
      realPath: path,
      allocatedBytes: params.allocatedBytes ?? 3 * MIB,
      kind: params.kind ?? 'directory',
      isComplete: params.isComplete ?? true,
      latestModifiedMs: params.latestModifiedMs ?? UNUSED_CUTOFF_MS - 1,
    }),
    unusedCutoffMs: UNUSED_CUTOFF_MS,
    minOfferedBytes: MIB,
  });
}

describeAwaitingWin32Platform('decideOrphanCandidate', () => {
  test('offers the container of an app that is not installed as careful leftovers', () => {
    const decision = decide({ name: 'com.example.removed' });

    expect(decision.kind).toBe('offer');
    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: '/home/Library/Containers/com.example.removed',
      risk: 'careful',
      category: 'leftovers',
      origin: { kind: 'leftover', matchedBy: 'bundleId' },
      explanation: CONTAINERS.explanation,
      allocatedBytes: 3 * MIB,
      lastUsedAtMs: UNUSED_CUTOFF_MS - 1,
      appName: null,
    });
  });

  test('says that a folder matched by its name alone may be tied to the wrong app', () => {
    const decision = decide({
      name: 'Removed Tool',
      matchedBy: 'name',
      location: APPLICATION_SUPPORT,
    });

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      risk: 'careful',
      origin: { kind: 'leftover', matchedBy: 'name' },
      explanation: `${APPLICATION_SUPPORT.explanation} It was tied to its app by its name alone, which may be wrong.`,
    });
  });

  test('skips a container that changed since the cutoff, or whose newest change is unknown', () => {
    expect(
      decide({ name: 'com.example.elsewhere', latestModifiedMs: UNUSED_CUTOFF_MS }),
    ).toMatchObject({ kind: 'skip', reason: 'recentActivity' });
    expect(decide({ name: 'com.example.partial', isComplete: false })).toMatchObject({
      kind: 'skip',
      reason: 'activityUnknown',
    });
  });

  test('skips a symbolic link and a small container', () => {
    expect(decide({ name: 'com.example.link', kind: 'symbolicLink' })).toMatchObject({
      kind: 'skip',
      reason: 'symbolicLink',
    });
    expect(decide({ name: 'com.example.small', allocatedBytes: MIB - 1 })).toMatchObject({
      kind: 'skip',
      reason: 'belowSizeThreshold',
    });
  });
});

describeAwaitingWin32Platform('matchOrphanName by bundle id', () => {
  test('matches a bundle id that no installed app carries', () => {
    expect(match({ name: 'com.example.removed', location: CONTAINERS })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('skips names that are not bundle ids where only bundle ids name the folders', () => {
    expect(match({ name: 'Data', location: CONTAINERS })).toEqual({
      kind: 'skip',
      reason: 'notBundleId',
    });
    expect(match({ name: 'Removed Tool', location: CACHES })).toEqual({
      kind: 'skip',
      reason: 'notBundleId',
    });
  });

  test('skips Apple ids and the ids of installed apps', () => {
    expect(match({ name: 'com.apple.Notes', location: CONTAINERS })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(match({ name: 'com.example.installed', location: CONTAINERS })).toMatchObject({
      reason: 'ownerInstalled',
    });
  });

  test('skips every possible orphan while an installed app could not be read', () => {
    expect(match({ name: 'com.example.removed', location: CONTAINERS, isComplete: false })).toEqual(
      { kind: 'skip', reason: 'installedAppsUnknown' },
    );
    expect(
      match({ name: 'com.example.installed', location: CONTAINERS, isComplete: false }),
    ).toMatchObject({ reason: 'ownerInstalled' });
  });

  test('keeps a folder a vendor shares while an app of that vendor is installed', () => {
    expect(match({ name: 'com.microsoft.Word', location: CACHES })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'group.com.microsoft.office', location: GROUP_CONTAINERS })).toMatchObject(
      { reason: 'ownerInstalled' },
    );
    expect(match({ name: 'com.example.removed', location: CACHES })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'group.org.removed.tools', location: GROUP_CONTAINERS })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('matches a sandbox of another app of an installed vendor, as each sandbox is one app', () => {
    expect(match({ name: 'com.microsoft.Word', location: CONTAINERS })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('reads the bundle id before the suffix of saved windows', () => {
    expect(match({ name: 'org.removed.tool.savedState', location: SAVED_STATE })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
    expect(
      match({ name: 'com.example.installed.savedState', location: SAVED_STATE }),
    ).toMatchObject({ reason: 'ownerInstalled' });
    expect(match({ name: 'org.removed.tool', location: SAVED_STATE })).toMatchObject({
      reason: 'notBundleId',
    });
  });

  test('skips a hidden folder', () => {
    expect(match({ name: '.com.example.removed', location: CONTAINERS })).toMatchObject({
      reason: 'notBundleId',
    });
  });
});

describeAwaitingWin32Platform('matchOrphanName by app name in Application Support', () => {
  test('matches the name of an app that is not installed', () => {
    expect(match({ name: 'Removed Tool', location: APPLICATION_SUPPORT })).toEqual({
      kind: 'match',
      matchedBy: 'name',
    });
  });

  test('skips the folders of macOS and its daemons under a plain name', () => {
    expect(match({ name: 'MobileSync', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(match({ name: 'rapportd', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'systemOwned',
    });
  });

  test('skips a generic word or a name without a word of four letters', () => {
    expect(match({ name: 'Google', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'genericName',
    });
    expect(match({ name: 'CrashPad', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'genericName',
    });
    expect(match({ name: 'App', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'genericName',
    });
  });

  test('skips the name of an installed app, its vendor folder, or a word they share', () => {
    expect(match({ name: 'Example', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'Affinity', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'Code', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'BraveSoftware', location: APPLICATION_SUPPORT })).toMatchObject({
      reason: 'ownerInstalled',
    });
  });

  test('matches no name while an installed app could not be read', () => {
    expect(
      match({ name: 'Removed Tool', location: APPLICATION_SUPPORT, isComplete: false }),
    ).toEqual({ kind: 'skip', reason: 'installedAppsUnknown' });
  });

  test('tells a held-back folder only where no other entry judges it, never an untied name', () => {
    expect(isOrphanNameSkipReported({ reason: 'ownerInstalled', location: CONTAINERS })).toBe(true);
    expect(isOrphanNameSkipReported({ reason: 'installedAppsUnknown', location: CONTAINERS })).toBe(
      true,
    );
    expect(isOrphanNameSkipReported({ reason: 'notBundleId', location: CONTAINERS })).toBe(false);
    expect(isOrphanNameSkipReported({ reason: 'genericName', location: CONTAINERS })).toBe(false);
    expect(isOrphanNameSkipReported({ reason: 'systemOwned', location: CACHES })).toBe(false);
    expect(
      isOrphanNameSkipReported({ reason: 'installedAppsUnknown', location: APPLICATION_SUPPORT }),
    ).toBe(false);
  });

  test('still reads a bundle id in Application Support as one', () => {
    expect(match({ name: 'org.removed.tool', location: APPLICATION_SUPPORT })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('takes the system and generic names from the naming of the location', () => {
    const location: OrphanLocation = {
      ...APPLICATION_SUPPORT,
      naming: {
        kind: 'bundleIdOrName',
        systemFolderNames: new Set(['removed tool']),
        systemServiceNamePattern: /^service$/,
        genericFolderNames: new Set(['mobilesync']),
      },
    };

    expect(match({ name: 'Removed Tool', location: location })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(match({ name: 'MobileSync', location: location })).toMatchObject({
      reason: 'genericName',
    });
    expect(match({ name: 'rapportd', location: location })).toEqual({
      kind: 'match',
      matchedBy: 'name',
    });
  });
});
