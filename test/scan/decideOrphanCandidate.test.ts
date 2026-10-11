import { describe, expect, test } from 'bun:test';
import { decideOrphanCandidate } from '../../src/scan/decideOrphanCandidate.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';

const MIB = 1_048_576;

function decide(params: { name: string; allocatedBytes?: number; kind?: FileKind }) {
  const path = `/home/Library/Containers/${params.name}`;

  return decideOrphanCandidate({
    path: path,
    name: params.name,
    measurement: buildTestMeasurement({
      realPath: path,
      allocatedBytes: params.allocatedBytes ?? 3 * MIB,
      kind: params.kind ?? 'directory',
    }),
    installedBundleIds: new Set(['com.example.installed']),
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
