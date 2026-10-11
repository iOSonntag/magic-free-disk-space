import { describe, expect, test } from 'bun:test';
import { decideUserFileCandidate } from '../../src/scan/decideUserFileCandidate.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestIdentity } from '../support/candidateFixtures.js';

const MIB = 1_048_576;
const CUTOFF_MS = Date.UTC(2026, 0, 1);
const PATH = '/home/Downloads/installer.dmg';

function decide(params: { allocatedBytes?: number; modifiedMs?: number; kind?: FileKind }) {
  return decideUserFileCandidate({
    finding: {
      path: PATH,
      identity: buildTestIdentity({ realPath: PATH, kind: params.kind ?? 'file' }),
      allocatedBytes: params.allocatedBytes ?? 300 * MIB,
      modifiedMs: params.modifiedMs ?? Date.UTC(2024, 5, 1),
    },
    unusedCutoffMs: CUTOFF_MS,
    minUserFileBytes: 100 * MIB,
  });
}

describe('decideUserFileCandidate', () => {
  test('offers an old large file as careful', () => {
    const decision = decide({});

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: PATH,
      title: 'installer.dmg',
      risk: 'careful',
      category: 'userFiles',
      origin: 'userFile',
      entryCount: 1,
      isComplete: true,
    });
    expect(decision.kind === 'offer' && decision.candidate.explanation).toContain('2024-06-01');
  });

  test('skips a recently changed file', () => {
    expect(decide({ modifiedMs: CUTOFF_MS })).toMatchObject({ reason: 'recentActivity' });
  });

  test('skips a small file and a symbolic link', () => {
    expect(decide({ allocatedBytes: 100 * MIB - 1 })).toMatchObject({
      reason: 'belowSizeThreshold',
    });
    expect(decide({ kind: 'symbolicLink' })).toMatchObject({ reason: 'symbolicLink' });
  });
});
