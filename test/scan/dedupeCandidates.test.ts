import { describe, expect, test } from 'bun:test';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { dedupeCandidates } from '../../src/scan/dedupeCandidates.js';
import { buildTestToolCandidate } from '../support/candidateFixtures.js';

describe('dedupeCandidates', () => {
  test('skips a tool item whose footprint lies inside an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/home/.local/share/mise', realPath: '/x' });
    const toolOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestToolCandidate({ homeDir: '/home', version: '20.1.0' }),
    };

    expect(dedupeCandidates({ decisions: [earlier, toolOffer] })).toEqual([
      earlier,
      {
        kind: 'skip',
        path: '/home/.local/share/mise/installs/node/20.1.0',
        reason: 'overlapsEarlierCandidate',
      },
    ]);
  });

  test('skips a later offer inside the footprint of a kept tool item', () => {
    const toolOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestToolCandidate({ homeDir: '/home', version: '20.1.0' }),
    };
    const inside = buildOfferDecision({
      path: '/home/.local/share/mise/installs/node/20.1.0/bin',
      realPath: '/y',
    });

    expect(dedupeCandidates({ decisions: [toolOffer, inside] })).toEqual([
      toolOffer,
      {
        kind: 'skip',
        path: '/home/.local/share/mise/installs/node/20.1.0/bin',
        reason: 'overlapsEarlierCandidate',
      },
    ]);
  });

  test('skips a tool item whose footprint holds a skipped path', () => {
    const skip: CandidateDecision = {
      kind: 'skip',
      path: '/home/.local/share/mise/installs/node/20.1.0/lib',
      reason: 'recentActivity',
    };
    const toolOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestToolCandidate({ homeDir: '/home', version: '20.1.0' }),
    };

    expect(dedupeCandidates({ decisions: [skip, toolOffer] })[1]).toEqual({
      kind: 'skip',
      path: '/home/.local/share/mise/installs/node/20.1.0',
      reason: 'overlapsEarlierCandidate',
    });
  });

  test('skips an offer whose real path equals an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupeCandidates({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips a later offer inside an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupeCandidates({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips a later offer that contains an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupeCandidates({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps a sibling whose name shares a prefix with an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const sibling = buildOfferDecision({ path: '/a/bc', realPath: '/a/bc' });

    expect(dedupeCandidates({ decisions: [earlier, sibling] })).toEqual([earlier, sibling]);
  });

  test('skips an offer inside an earlier advice path', () => {
    const advice = buildAdviceDecision({ path: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupeCandidates({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips an offer inside an earlier advice path that ends with a slash', () => {
    const advice = buildAdviceDecision({ path: '/a/b/' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupeCandidates({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips an offer that contains an earlier advice path', () => {
    const advice = buildAdviceDecision({ path: '/a/b/c' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupeCandidates({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('a folder holding a withheld item is not offered whole', () => {
    const withheld: CandidateDecision = {
      kind: 'skip',
      path: '/home/Library/Caches/Browser/Profile',
      reason: 'ownerRunning',
    };
    const catchAll = buildOfferDecision({
      path: '/home/Library/Caches/Browser',
      realPath: '/home/Library/Caches/Browser',
    });

    expect(dedupeCandidates({ decisions: [withheld, catchAll] })).toEqual([
      withheld,
      { kind: 'skip', path: '/home/Library/Caches/Browser', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('a skipped folder does not block an offer inside it, only offers holding it', () => {
    const skip: CandidateDecision = { kind: 'skip', path: '/a/b', reason: 'belowSizeThreshold' };
    const inside = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });
    const sibling = buildOfferDecision({ path: '/a/bc', realPath: '/a/bc' });

    expect(dedupeCandidates({ decisions: [skip, inside, sibling] })).toEqual([
      skip,
      inside,
      sibling,
    ]);
  });

  test('a later skip inside an earlier offer still withholds that offer', () => {
    const earlier = buildOfferDecision({
      path: '/home/Documents/app',
      realPath: '/home/Documents/app',
    });
    const laterSkip: CandidateDecision = {
      kind: 'skip',
      path: '/home/Documents/app/recent.bin',
      reason: 'recentActivity',
    };

    expect(dedupeCandidates({ decisions: [earlier, laterSkip] })).toEqual([
      { kind: 'skip', path: '/home/Documents/app', reason: 'overlapsEarlierCandidate' },
      laterSkip,
    ]);
  });

  test('an earlier specific offer wins over a later skip of the same path', () => {
    const specific = buildOfferDecision({
      path: '/home/Library/Caches/com.apple.dt.Xcode',
      realPath: '/home/Library/Caches/com.apple.dt.Xcode',
    });
    const catchAllSkip: CandidateDecision = {
      kind: 'skip',
      path: '/home/Library/Caches/com.apple.dt.Xcode',
      reason: 'systemOwned',
    };

    expect(dedupeCandidates({ decisions: [specific, catchAllSkip] })).toEqual([
      specific,
      catchAllSkip,
    ]);
  });

  test('compares the paths the scan produced, not where they resolve', () => {
    const tempSkip: CandidateDecision = {
      kind: 'skip',
      path: '/var/folders/x/T/build/held',
      reason: 'ownerRunning',
    };
    const tempOffer = buildOfferDecision({
      path: '/var/folders/x/T/build',
      realPath: '/private/var/folders/x/T/build',
    });

    expect(dedupeCandidates({ decisions: [tempSkip, tempOffer] })).toEqual([
      tempSkip,
      { kind: 'skip', path: '/var/folders/x/T/build', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps the length and order and does not change the input array', () => {
    const advice = buildAdviceDecision({ path: '/a/b' });
    const sibling = buildOfferDecision({ path: '/a/bc', realPath: '/a/bc' });
    const inside = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });
    const decisions: CandidateDecision[] = [advice, sibling, inside];
    const decisionsBefore = [...decisions];

    const result = dedupeCandidates({ decisions });

    expect(result).toEqual([
      advice,
      sibling,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
    expect(result).not.toBe(decisions);
    expect(decisions).toEqual(decisionsBefore);
  });
});

function buildOfferDecision(params: { path: string; realPath: string }): CandidateDecision {
  return {
    kind: 'offer',
    candidate: {
      path: params.path,
      title: 'Fixture cache',
      category: 'caches',
      risk: 'safe',
      origin: 'catalog',
      explanation: 'Fixture explanation.',
      regeneration: 'Fixture regeneration.',
      allocatedBytes: 1024,
      entryCount: 1,
      isComplete: true,
      removal: {
        kind: 'deletePath',
        identity: {
          dev: 1n,
          ino: 1n,
          birthtimeNs: 1n,
          kind: 'directory',
          realPath: params.realPath,
        },
        ownerBundlePaths: [],
      },
      evidenceLines: [],
    },
  };
}

function buildAdviceDecision(params: { path: string }): CandidateDecision {
  return {
    kind: 'advice',
    advice: {
      path: params.path,
      title: 'Fixture advice',
      category: 'system',
      risk: 'never',
      explanation: 'Fixture explanation.',
      advice: 'Fixture advice text.',
      allocatedBytes: 1024,
      isComplete: true,
    },
  };
}
