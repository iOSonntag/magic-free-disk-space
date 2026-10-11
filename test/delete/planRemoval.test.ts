import { describe, expect, test } from 'bun:test';
import { planRemoval } from '../../src/delete/planRemoval.js';
import { buildEnvironment } from '../../src/environment/buildEnvironment.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { buildTestCandidate } from '../support/candidateFixtures.js';

const ENVIRONMENT = buildEnvironment({
  platform: 'darwin',
  nowMs: 0,
  homeDir: '/Users/tester',
  homeRealPath: '/Users/tester',
  tempDir: '/private/tmp/tester',
  tempRealPath: '/private/tmp/tester',
  applicationDirs: ['/Applications'],
  applicationRealPaths: ['/Applications'],
});

const VALID_CANDIDATES: Candidate[] = [1, 2, 3, 4, 5, 6].map((index) =>
  buildTestCandidate({ path: `/Users/tester/Library/Caches/com.example.app${index}` }),
);

// Candidates 2 and 5 are refused by the guards, so a selection of them must never be approved.
const MIXED_CANDIDATES: Candidate[] = [
  buildTestCandidate({ path: '/Users/tester/Library/Caches/one' }),
  buildTestCandidate({ path: '/Users/tester/Library', risk: 'safe' }),
  buildTestCandidate({ path: '/Users/tester/Downloads/three.zip', kind: 'file' }),
  buildTestCandidate({ path: '/Users/tester/.cache/four' }),
  buildTestCandidate({ path: '/Applications/Xcode.app', risk: 'never' }),
  buildTestCandidate({ path: '/private/tmp/tester/six' }),
];

function buildAllSelections(count: number): number[][] {
  const selections: number[][] = [];

  for (let mask = 0; mask < 2 ** count; mask += 1) {
    const selection: number[] = [];

    for (let bit = 0; bit < count; bit += 1) {
      if ((mask & (1 << bit)) !== 0) {
        selection.push(bit + 1);
      }
    }

    selections.push(selection);
  }

  return selections;
}

describe('planRemoval', () => {
  test('approves exactly the selection, for every one of the 64 subsets of six items', () => {
    const selections = buildAllSelections(6);

    expect(selections).toHaveLength(64);

    for (const selection of selections) {
      const plan = planRemoval({
        ranked: VALID_CANDIDATES,
        selectedNumbers: selection,
        environment: ENVIRONMENT,
      });
      const approvedNumbers = plan.approved.map(
        (candidate) => VALID_CANDIDATES.indexOf(candidate) + 1,
      );

      expect(approvedNumbers).toEqual(selection);
      expect(plan.refused).toEqual([]);
    }
  });

  test('never approves an unselected or guarded item, for every subset of a mixed ranking', () => {
    for (const selection of buildAllSelections(6)) {
      const plan = planRemoval({
        ranked: MIXED_CANDIDATES,
        selectedNumbers: selection,
        environment: ENVIRONMENT,
      });
      const approvedNumbers = plan.approved.map(
        (candidate) => MIXED_CANDIDATES.indexOf(candidate) + 1,
      );
      const refusedNumbers = plan.refused.map((refusal) => refusal.number);

      expect(approvedNumbers).toEqual(selection.filter((number) => number !== 2 && number !== 5));
      expect(refusedNumbers).toEqual(selection.filter((number) => number === 2 || number === 5));
    }
  });

  test('names the refusal reason and the number of a refused item', () => {
    const plan = planRemoval({
      ranked: MIXED_CANDIDATES,
      selectedNumbers: [5, 2],
      environment: ENVIRONMENT,
    });

    expect(plan.refused).toEqual([
      { path: '/Users/tester/Library', number: 2, reason: 'protectedRoot' },
      { path: '/Applications/Xcode.app', number: 5, reason: 'neverRisk' },
    ]);
  });

  test('ignores a repeated number', () => {
    const plan = planRemoval({
      ranked: VALID_CANDIDATES,
      selectedNumbers: [3, 3, 3],
      environment: ENVIRONMENT,
    });

    expect(plan.approved).toHaveLength(1);
  });

  test('throws for a number outside the ranking', () => {
    for (const number of [0, 7, -1, 1.5]) {
      expect(() =>
        planRemoval({
          ranked: VALID_CANDIDATES,
          selectedNumbers: [number],
          environment: ENVIRONMENT,
        }),
      ).toThrow();
    }
  });
});
