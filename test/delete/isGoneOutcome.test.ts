import { describe, expect, test } from 'bun:test';
import type { RemovalOutcomeKind } from '../../src/delete/deleteCandidates.js';
import { isGoneOutcome } from '../../src/delete/isGoneOutcome.js';

describe('isGoneOutcome', () => {
  test('is true only for the outcomes that leave their item gone', () => {
    const kinds: RemovalOutcomeKind[] = [
      'removed',
      'alreadyGone',
      'changedSinceScan',
      'ownerRunning',
      'permissionDenied',
      'failed',
      'notAttempted',
      'toolFailed',
      'engineInUse',
      'engineNotRunning',
    ];

    expect(kinds.filter(isGoneOutcome)).toEqual(['removed', 'alreadyGone']);
  });
});
