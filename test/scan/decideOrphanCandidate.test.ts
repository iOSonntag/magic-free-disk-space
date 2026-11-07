import { expect, test } from 'bun:test';
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

/** Each folder is one app's own sandbox, and no other entry judges it. */
const SANDBOX_LOCATION: OrphanLocation = {
  pathNames: ['Library', 'Sandboxes'],
  naming: { kind: 'bundleId' },
  nameSuffix: '',
  isVendorShared: false,
  isOnlyJudge: true,
  explanation: 'The sandbox of an app that is not installed.',
};

/** A vendor's apps may share a folder, and other entries judge it too. */
const SHARED_LOCATION: OrphanLocation = {
  pathNames: ['Library', 'Shared'],
  naming: { kind: 'bundleId' },
  nameSuffix: '',
  isVendorShared: true,
  isOnlyJudge: false,
  explanation: 'The shared data of an app that is not installed.',
};

const SUFFIXED_LOCATION: OrphanLocation = {
  pathNames: ['Library', 'Suffixed'],
  naming: { kind: 'bundleId' },
  nameSuffix: '.savedState',
  isVendorShared: true,
  isOnlyJudge: false,
  explanation: 'The saved windows of an app that is not installed.',
};

/** Its folders are named by a bundle id or by an app's name. */
const NAMED_LOCATION: OrphanLocation = {
  pathNames: ['Library', 'Named'],
  naming: {
    kind: 'bundleIdOrName',
    systemFolderNames: new Set(['system folder']),
    systemServiceNamePattern: /^service$/,
    genericFolderNames: new Set(['vendor']),
  },
  nameSuffix: '',
  isVendorShared: true,
  isOnlyJudge: false,
  explanation: 'The support folder of an app that is not installed.',
};

function buildInstalled(params: { isComplete: boolean }): OrphanInstalledFacts {
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
    isComplete: params.isComplete,
  });
}

function match(params: { name: string; location: OrphanLocation; isComplete?: boolean }) {
  return matchOrphanName({
    name: params.name,
    location: params.location,
    installed: buildInstalled({ isComplete: params.isComplete ?? true }),
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
    location: params.location ?? SANDBOX_LOCATION,
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
      explanation: SANDBOX_LOCATION.explanation,
      allocatedBytes: 3 * MIB,
      lastUsedAtMs: UNUSED_CUTOFF_MS - 1,
      appName: null,
    });
  });

  test('says that a folder matched by its name alone may be tied to the wrong app', () => {
    const decision = decide({
      name: 'Removed Tool',
      matchedBy: 'name',
      location: NAMED_LOCATION,
    });

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      risk: 'careful',
      origin: { kind: 'leftover', matchedBy: 'name' },
      explanation: `${NAMED_LOCATION.explanation} It was tied to its app by its name alone, which may be wrong.`,
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
    expect(match({ name: 'com.example.removed', location: SANDBOX_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('skips names that are not bundle ids where only bundle ids name the folders', () => {
    expect(match({ name: 'Data', location: SANDBOX_LOCATION })).toEqual({
      kind: 'skip',
      reason: 'notBundleId',
    });
    expect(match({ name: 'Removed Tool', location: SHARED_LOCATION })).toEqual({
      kind: 'skip',
      reason: 'notBundleId',
    });
  });

  test('skips Apple ids and the ids of installed apps', () => {
    expect(match({ name: 'com.apple.Notes', location: SANDBOX_LOCATION })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(match({ name: 'com.example.installed', location: SANDBOX_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
  });

  test('skips every possible orphan while an installed app could not be read', () => {
    expect(
      match({ name: 'com.example.removed', location: SANDBOX_LOCATION, isComplete: false }),
    ).toEqual({ kind: 'skip', reason: 'installedAppsUnknown' });
    expect(
      match({ name: 'com.example.installed', location: SANDBOX_LOCATION, isComplete: false }),
    ).toMatchObject({ reason: 'ownerInstalled' });
  });

  test('keeps a folder a vendor shares while an app of that vendor is installed', () => {
    expect(match({ name: 'com.microsoft.Word', location: SHARED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'group.com.microsoft.office', location: SHARED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'com.example.removed', location: SHARED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'group.org.removed.tools', location: SHARED_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('matches a sandbox of another app of an installed vendor, as each sandbox is one app', () => {
    expect(match({ name: 'com.microsoft.Word', location: SANDBOX_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('reads the bundle id before the suffix of saved windows', () => {
    expect(match({ name: 'org.removed.tool.savedState', location: SUFFIXED_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
    expect(
      match({ name: 'com.example.installed.savedState', location: SUFFIXED_LOCATION }),
    ).toMatchObject({ reason: 'ownerInstalled' });
    expect(match({ name: 'org.removed.tool', location: SUFFIXED_LOCATION })).toMatchObject({
      reason: 'notBundleId',
    });
  });

  test('skips a hidden folder', () => {
    expect(match({ name: '.com.example.removed', location: SANDBOX_LOCATION })).toMatchObject({
      reason: 'notBundleId',
    });
  });
});

describeAwaitingWin32Platform('matchOrphanName by app name in Application Support', () => {
  test('matches the name of an app that is not installed', () => {
    expect(match({ name: 'Removed Tool', location: NAMED_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'name',
    });
  });

  test('skips the folders of the system and its services under a plain name', () => {
    expect(match({ name: 'System Folder', location: NAMED_LOCATION })).toMatchObject({
      reason: 'systemOwned',
    });
    expect(match({ name: 'service', location: NAMED_LOCATION })).toMatchObject({
      reason: 'systemOwned',
    });
  });

  test('skips a generic word or a name without a word of four letters', () => {
    expect(match({ name: 'Vendor', location: NAMED_LOCATION })).toMatchObject({
      reason: 'genericName',
    });
    expect(match({ name: 'App', location: NAMED_LOCATION })).toMatchObject({
      reason: 'genericName',
    });
  });

  test('skips the name of an installed app, its vendor folder, or a word they share', () => {
    expect(match({ name: 'Example', location: NAMED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'Affinity', location: NAMED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'Code', location: NAMED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
    expect(match({ name: 'BraveSoftware', location: NAMED_LOCATION })).toMatchObject({
      reason: 'ownerInstalled',
    });
  });

  test('matches no name while an installed app could not be read', () => {
    expect(match({ name: 'Removed Tool', location: NAMED_LOCATION, isComplete: false })).toEqual({
      kind: 'skip',
      reason: 'installedAppsUnknown',
    });
  });

  test('tells a held-back folder only where no other entry judges it, never an untied name', () => {
    expect(isOrphanNameSkipReported({ reason: 'ownerInstalled', location: SANDBOX_LOCATION })).toBe(
      true,
    );
    expect(
      isOrphanNameSkipReported({ reason: 'installedAppsUnknown', location: SANDBOX_LOCATION }),
    ).toBe(true);
    expect(isOrphanNameSkipReported({ reason: 'notBundleId', location: SANDBOX_LOCATION })).toBe(
      false,
    );
    expect(isOrphanNameSkipReported({ reason: 'genericName', location: SANDBOX_LOCATION })).toBe(
      false,
    );
    expect(isOrphanNameSkipReported({ reason: 'systemOwned', location: SHARED_LOCATION })).toBe(
      false,
    );
    expect(
      isOrphanNameSkipReported({ reason: 'installedAppsUnknown', location: NAMED_LOCATION }),
    ).toBe(false);
  });

  test('still reads a bundle id in Application Support as one', () => {
    expect(match({ name: 'org.removed.tool', location: NAMED_LOCATION })).toEqual({
      kind: 'match',
      matchedBy: 'bundleId',
    });
  });

  test('takes the system and generic names from the naming of the location', () => {
    const location: OrphanLocation = {
      ...NAMED_LOCATION,
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
