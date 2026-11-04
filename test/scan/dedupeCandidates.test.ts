import { describe, expect, test } from 'bun:test';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { dedupeCandidates } from '../../src/scan/dedupeCandidates.js';
import {
  buildTestAdvice,
  buildTestCandidate,
  buildTestIdeVersionCandidate,
  buildTestInstallersCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import { buildExampleHome } from '../support/parsedValueFixtures.js';

const HUGGING_FACE_HUB_PATH = '/home/.cache/huggingface/hub';
const JETBRAINS_CACHES_PATH = '/home/Library/Caches/JetBrains';
const OUTDATED_IDE_CACHE_PATH = `${JETBRAINS_CACHES_PATH}/IntelliJIdea2024.1`;

const HOME = buildExampleHome({ text: '/home' });

describe('dedupeCandidates', () => {
  test('skips a tool item whose footprint lies inside an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/home/.local/share/mise', realPath: '/x' });
    const toolOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestToolCandidate({ home: HOME, version: '20.1.0' }),
    };

    expect(dedupe({ decisions: [earlier, toolOffer] })).toEqual([
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
      candidate: buildTestToolCandidate({ home: HOME, version: '20.1.0' }),
    };
    const inside = buildOfferDecision({
      path: '/home/.local/share/mise/installs/node/20.1.0/bin',
      realPath: '/y',
    });

    expect(dedupe({ decisions: [toolOffer, inside] })).toEqual([
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
      reason: 'ownerRunning',
    };
    const toolOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestToolCandidate({ home: HOME, version: '20.1.0' }),
    };

    expect(dedupe({ decisions: [skip, toolOffer] })[1]).toEqual({
      kind: 'skip',
      path: '/home/.local/share/mise/installs/node/20.1.0',
      reason: 'overlapsEarlierCandidate',
    });
  });

  test('keeps a probed unit whose targets a skip for recent use names, since its probe judged their age', () => {
    const installerPath = '/home/Downloads/Example-1.0.dmg';
    const recentLargeFile: CandidateDecision = {
      kind: 'skip',
      path: installerPath,
      reason: 'recentUse',
    };
    const installersOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestInstallersCandidate({
        downloadsPath: '/home/Downloads',
        installerPath: installerPath,
      }),
    };

    expect(dedupe({ decisions: [recentLargeFile, installersOffer] })).toEqual([
      recentLargeFile,
      installersOffer,
    ]);
  });

  test('still holds a probed unit back behind a skip that protects its target', () => {
    const installerPath = '/home/Downloads/Example-1.0.dmg';
    const protectedSkip: CandidateDecision = {
      kind: 'skip',
      path: installerPath,
      reason: 'protectedPath',
    };
    const installersOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestInstallersCandidate({
        downloadsPath: '/home/Downloads',
        installerPath: installerPath,
      }),
    };

    expect(dedupe({ decisions: [protectedSkip, installersOffer] })).toEqual([
      protectedSkip,
      { kind: 'skip', path: '/home/Downloads', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips an offer whose real path equals an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupe({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips a later offer inside an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupe({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips a later offer that contains an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupe({ decisions: [earlier, later] })).toEqual([
      earlier,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps a sibling whose name shares a prefix with an earlier offer', () => {
    const earlier = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });
    const sibling = buildOfferDecision({ path: '/a/bc', realPath: '/a/bc' });

    expect(dedupe({ decisions: [earlier, sibling] })).toEqual([earlier, sibling]);
  });

  test('skips an offer inside an earlier advice path', () => {
    const advice = buildAdviceDecision({ path: '/a/b' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupe({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips an offer inside an earlier advice path that ends with a slash', () => {
    const advice = buildAdviceDecision({ path: '/a/b/' });
    const later = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });

    expect(dedupe({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('skips an offer that contains an earlier advice path', () => {
    const advice = buildAdviceDecision({ path: '/a/b/c' });
    const later = buildOfferDecision({ path: '/a/b', realPath: '/a/b' });

    expect(dedupe({ decisions: [advice, later] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps an offer of an advice path carved out of the advice, or inside it, on either side', () => {
    const advice = buildAdviceDecision({ path: '/a/b', carvedPaths: ['/a/b/carved'] });
    const carved = buildOfferDecision({ path: '/a/b/carved', realPath: '/a/b/carved' });
    const inside = buildOfferDecision({ path: '/a/b/carved/x', realPath: '/a/b/carved/x' });

    expect(dedupe({ decisions: [carved, advice] })).toEqual([carved, advice]);
    expect(dedupe({ decisions: [advice, inside] })).toEqual([advice, inside]);
  });

  test('still skips an offer inside an advice path beside its carved path', () => {
    const advice = buildAdviceDecision({ path: '/a/b', carvedPaths: ['/a/b/carved'] });
    const sibling = buildOfferDecision({ path: '/a/b/carvedx', realPath: '/a/b/carvedx' });
    const holding = buildOfferDecision({ path: '/a', realPath: '/a' });

    expect(dedupe({ decisions: [advice, sibling, holding] })).toEqual([
      advice,
      { kind: 'skip', path: '/a/b/carvedx', reason: 'overlapsEarlierCandidate' },
      { kind: 'skip', path: '/a', reason: 'overlapsEarlierCandidate' },
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

    expect(dedupe({ decisions: [withheld, catchAll] })).toEqual([
      withheld,
      { kind: 'skip', path: '/home/Library/Caches/Browser', reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('a skipped folder does not block an offer inside it, only offers holding it', () => {
    const skip: CandidateDecision = { kind: 'skip', path: '/a/b', reason: 'belowSizeThreshold' };
    const inside = buildOfferDecision({ path: '/a/b/c', realPath: '/a/b/c' });
    const sibling = buildOfferDecision({ path: '/a/bc', realPath: '/a/bc' });

    expect(dedupe({ decisions: [skip, inside, sibling] })).toEqual([skip, inside, sibling]);
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

    expect(dedupe({ decisions: [earlier, laterSkip] })).toEqual([
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

    expect(dedupe({ decisions: [specific, catchAllSkip] })).toEqual([specific, catchAllSkip]);
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

    expect(dedupe({ decisions: [tempSkip, tempOffer] })).toEqual([
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

    const result = dedupe({ decisions: decisions });

    expect(result).toEqual([
      advice,
      sibling,
      { kind: 'skip', path: '/a/b/c', reason: 'overlapsEarlierCandidate' },
    ]);
    expect(result).not.toBe(decisions);
    expect(decisions).toEqual(decisionsBefore);
  });

  test('an offer that holds an explore entry path gives way to its probe', () => {
    const parent = buildOfferDecision({ path: '/home/.cache/huggingface', realPath: '/x' });

    expect(dedupe({ decisions: [parent], reservedEntryPaths: [HUGGING_FACE_HUB_PATH] })).toEqual([
      { kind: 'skip', path: '/home/.cache/huggingface', reason: 'heldByProbe' },
    ]);
  });

  test('an offer of an explore entry path itself gives way to its probe', () => {
    const same = buildOfferDecision({ path: HUGGING_FACE_HUB_PATH, realPath: '/x' });

    expect(dedupe({ decisions: [same], reservedEntryPaths: [HUGGING_FACE_HUB_PATH] })).toEqual([
      { kind: 'skip', path: HUGGING_FACE_HUB_PATH, reason: 'heldByProbe' },
    ]);
  });

  test('an offer inside an explore entry path stays, since no unit names it', () => {
    const inside = buildOfferDecision({ path: `${HUGGING_FACE_HUB_PATH}/.locks`, realPath: '/x' });
    const sibling = buildOfferDecision({ path: '/home/.cache/huggingface-cli', realPath: '/y' });

    expect(
      dedupe({ decisions: [inside, sibling], reservedEntryPaths: [HUGGING_FACE_HUB_PATH] }),
    ).toEqual([inside, sibling]);
  });

  test('an offer that holds a target of a probed unit gives way, wherever the unit stands', () => {
    const catchAll = buildOfferDecision({ path: JETBRAINS_CACHES_PATH, realPath: '/x' });
    const unitOffer = buildIdeCacheUnitDecision();

    expect(dedupe({ decisions: [catchAll, unitOffer] })).toEqual([
      { kind: 'skip', path: JETBRAINS_CACHES_PATH, reason: 'heldByProbe' },
      unitOffer,
    ]);
  });

  test('an offer of a unit target itself or inside one gives way', () => {
    const unitOffer = buildIdeCacheUnitDecision();
    const same = buildOfferDecision({ path: OUTDATED_IDE_CACHE_PATH, realPath: '/x' });
    const inside = buildOfferDecision({ path: `${OUTDATED_IDE_CACHE_PATH}/index`, realPath: '/y' });

    expect(dedupe({ decisions: [same, inside, unitOffer] })).toEqual([
      { kind: 'skip', path: OUTDATED_IDE_CACHE_PATH, reason: 'heldByProbe' },
      { kind: 'skip', path: `${OUTDATED_IDE_CACHE_PATH}/index`, reason: 'heldByProbe' },
      unitOffer,
    ]);
  });

  test('a later offer inside one that gave way stays when no unit names it', () => {
    const catchAll = buildOfferDecision({ path: JETBRAINS_CACHES_PATH, realPath: '/x' });
    const unitOffer = buildIdeCacheUnitDecision();
    const otherChild = buildOfferDecision({
      path: `${JETBRAINS_CACHES_PATH}/Toolbox`,
      realPath: '/y',
    });

    expect(dedupe({ decisions: [catchAll, unitOffer, otherChild] })).toEqual([
      { kind: 'skip', path: JETBRAINS_CACHES_PATH, reason: 'heldByProbe' },
      unitOffer,
      otherChild,
    ]);
  });

  test('a probed offer never gives way to an entry path or a unit target', () => {
    const downloadsPath = '/home/Downloads';
    const installerPath = `${downloadsPath}/old-installer.dmg`;
    const installersOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestInstallersCandidate({
        downloadsPath: downloadsPath,
        installerPath: installerPath,
      }),
    };

    expect(dedupe({ decisions: [installersOffer], reservedEntryPaths: [downloadsPath] })).toEqual([
      installersOffer,
    ]);
  });

  test('an offer that overlaps an earlier item is skipped as such before a probe holds it', () => {
    const skip: CandidateDecision = {
      kind: 'skip',
      path: `${HUGGING_FACE_HUB_PATH}/models--example--model`,
      reason: 'recentActivity',
    };
    const parent = buildOfferDecision({ path: '/home/.cache/huggingface', realPath: '/x' });

    expect(
      dedupe({ decisions: [skip, parent], reservedEntryPaths: [HUGGING_FACE_HUB_PATH] }),
    ).toEqual([
      skip,
      { kind: 'skip', path: '/home/.cache/huggingface', reason: 'overlapsEarlierCandidate' },
    ]);
  });
});

function dedupe(params: {
  decisions: CandidateDecision[];
  reservedEntryPaths?: string[];
}): CandidateDecision[] {
  return dedupeCandidates({
    pathRules: DARWIN_PATH_RULES,
    decisions: params.decisions,
    reservedEntryPaths: params.reservedEntryPaths ?? [],
  });
}

/** The caches folder of an outdated IntelliJ IDEA, as the probe of IDE versions offers it. */
function buildIdeCacheUnitDecision(): CandidateDecision {
  return {
    kind: 'offer',
    candidate: buildTestIdeVersionCandidate({
      product: 'IntelliJIdea',
      version: '2024.1',
      folderPath: OUTDATED_IDE_CACHE_PATH,
    }),
  };
}

function buildOfferDecision(params: { path: string; realPath: string }): CandidateDecision {
  return {
    kind: 'offer',
    candidate: buildTestCandidate({
      path: params.path,
      realPath: params.realPath,
      kind: 'directory',
      allocatedBytes: 1024,
    }),
  };
}

function buildAdviceDecision(params: { path: string; carvedPaths?: string[] }): CandidateDecision {
  return {
    kind: 'advice',
    advice: buildTestAdvice({
      path: params.path,
      category: 'system',
      risk: 'never',
      carvedPaths: params.carvedPaths ?? [],
    }),
  };
}
