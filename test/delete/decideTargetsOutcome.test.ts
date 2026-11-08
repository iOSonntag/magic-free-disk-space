import { describe, expect, test } from 'bun:test';
import { decideTargetsOutcome } from '../../src/delete/decideTargetsOutcome.js';
import type { RemovalOutcomeKind } from '../../src/delete/deleteCandidates.js';

type TestTarget = { path: string; outcome: RemovalOutcomeKind };

function decideTestTargets(targets: [TestTarget, ...TestTarget[]]) {
  return decideTargetsOutcome({ targets: targets, getOutcome: (target) => target.outcome });
}

describe('decideTargetsOutcome', () => {
  test('is removed when every target is gone and one went by this run', () => {
    expect(
      decideTestTargets([
        { path: '/a', outcome: 'alreadyGone' },
        { path: '/b', outcome: 'removed' },
      ]),
    ).toEqual({ kind: 'gone', outcome: 'removed' });
  });

  test('is alreadyGone when every target was gone before the run', () => {
    expect(
      decideTestTargets([
        { path: '/a', outcome: 'alreadyGone' },
        { path: '/b', outcome: 'alreadyGone' },
      ]),
    ).toEqual({ kind: 'gone', outcome: 'alreadyGone' });
  });

  test('names the first target that is not gone', () => {
    const changed: TestTarget = { path: '/b', outcome: 'changedSinceScan' };

    expect(
      decideTestTargets([
        { path: '/a', outcome: 'removed' },
        changed,
        { path: '/c', outcome: 'toolFailed' },
      ]),
    ).toEqual({ kind: 'stayed', target: changed });
  });
});
