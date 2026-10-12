import { describe, expect, test } from 'bun:test';
import { decideOrphanCandidate } from '../../src/scan/decideOrphanCandidate.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';

const MIB = 1_048_576;
const UNUSED_CUTOFF_MS = 1_650_000_000_000;

function decide(params: {
  name: string;
  allocatedBytes?: number;
  kind?: FileKind;
  isComplete?: boolean;
  latestModifiedMs?: number;
  isInstalledAppListComplete?: boolean;
}) {
  const path = `/home/Library/Containers/${params.name}`;

  return decideOrphanCandidate({
    path: path,
    name: params.name,
    measurement: buildTestMeasurement({
      realPath: path,
      allocatedBytes: params.allocatedBytes ?? 3 * MIB,
      kind: params.kind ?? 'directory',
      isComplete: params.isComplete ?? true,
      latestModifiedMs: params.latestModifiedMs ?? UNUSED_CUTOFF_MS - 1,
    }),
    installedBundleIds: new Set(['com.example.installed']),
    isInstalledAppListComplete: params.isInstalledAppListComplete ?? true,
    unusedCutoffMs: UNUSED_CUTOFF_MS,
    minOfferedBytes: MIB,
  });
}

describe('decideOrphanCandidate', () => {
  test('offers the container of an app that is not installed as careful leftovers', () => {
    const decision = decide({ name: 'com.example.removed' });

    expect(decision.kind).toBe('offer');
    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: '/home/Library/Containers/com.example.removed',
      risk: 'careful',
      category: 'leftovers',
      origin: 'leftover',
      allocatedBytes: 3 * MIB,
    });
  });

  test('skips names that are not bundle ids', () => {
    expect(decide({ name: 'Data' })).toMatchObject({ kind: 'skip', reason: 'notBundleId' });
  });

  test('skips Apple containers', () => {
    expect(decide({ name: 'com.apple.Notes' })).toMatchObject({
      kind: 'skip',
      reason: 'systemOwned',
    });
  });

  test('skips the container of an installed app', () => {
    expect(decide({ name: 'com.example.installed' })).toMatchObject({
      kind: 'skip',
      reason: 'ownerInstalled',
    });
  });

  test('skips every possible orphan while an installed app could not be read', () => {
    expect(decide({ name: 'com.example.removed', isInstalledAppListComplete: false })).toEqual({
      kind: 'skip',
      path: '/home/Library/Containers/com.example.removed',
      reason: 'installedAppsUnknown',
    });
    expect(
      decide({ name: 'com.example.installed', isInstalledAppListComplete: false }),
    ).toMatchObject({ kind: 'skip', reason: 'ownerInstalled' });
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
