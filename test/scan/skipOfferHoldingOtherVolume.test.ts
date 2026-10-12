import { describe, expect, test } from 'bun:test';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { skipOfferHoldingOtherVolume } from '../../src/scan/skipOfferHoldingOtherVolume.js';
import { buildTestCandidate, buildTestMeasurement } from '../support/candidateFixtures.js';

const PATH = '/Users/tester/Library/Caches/com.example.app';

function measure(params: { holdsOtherVolume: boolean }) {
  return buildTestMeasurement({
    realPath: PATH,
    allocatedBytes: 4096,
    holdsOtherVolume: params.holdsOtherVolume,
  });
}

describe('skipOfferHoldingOtherVolume', () => {
  test('skips an offer whose tree holds another volume', () => {
    const offer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestCandidate({ path: PATH }),
    };

    expect(
      skipOfferHoldingOtherVolume({
        decision: offer,
        measurement: measure({ holdsOtherVolume: true }),
      }),
    ).toEqual({ kind: 'skip', path: PATH, reason: 'holdsOtherVolume' });
  });

  test('keeps an offer on one volume, and advice and skips on any', () => {
    const offer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestCandidate({ path: PATH }),
    };
    const advice: CandidateDecision = {
      kind: 'advice',
      advice: {
        path: PATH,
        title: 'Simulator runtimes',
        category: 'system',
        risk: 'careful',
        explanation: 'Runtimes.',
        advice: 'Use xcrun simctl.',
        allocatedBytes: 4096,
        isComplete: true,
      },
    };
    const skip: CandidateDecision = { kind: 'skip', path: PATH, reason: 'belowSizeThreshold' };

    expect(
      skipOfferHoldingOtherVolume({
        decision: offer,
        measurement: measure({ holdsOtherVolume: false }),
      }),
    ).toBe(offer);
    expect(
      skipOfferHoldingOtherVolume({
        decision: advice,
        measurement: measure({ holdsOtherVolume: true }),
      }),
    ).toBe(advice);
    expect(
      skipOfferHoldingOtherVolume({
        decision: skip,
        measurement: measure({ holdsOtherVolume: true }),
      }),
    ).toBe(skip);
  });
});
