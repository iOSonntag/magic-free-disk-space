import { expect, test } from 'bun:test';
import { buildSectionTotals } from '../../src/scan/buildSectionTotals.js';
import type { Advice } from '../../src/scan/candidate.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestToolCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';

function buildAdvice(params: { path: string }): Advice {
  return {
    origin: { kind: 'catalog', entryId: 'tool-store' },
    path: params.path,
    title: 'Tool store',
    category: 'packages',
    risk: 'review',
    explanation: 'Packages the tool keeps.',
    advice: 'Run the tool prune command.',
    opener: null,
    allocatedBytes: 9000,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
  };
}

describeAwaitingWin32Platform('buildSectionTotals', () => {
  test('holds no section for a scan that found nothing', () => {
    expect(buildSectionTotals({ candidates: [], advice: [] })).toEqual([]);
  });

  test('sums each section top to bottom with its safe group, and counts its advice without its size', () => {
    const totals = buildSectionTotals({
      candidates: [
        buildTestCandidate({
          path: '/fixture/movie.mov',
          category: 'userFiles',
          risk: 'careful',
          allocatedBytes: 400,
        }),
        buildTestCandidate({ path: '/fixture/a', risk: 'safe', allocatedBytes: 100 }),
        buildTestCandidate({ path: '/fixture/b', risk: 'review', allocatedBytes: 200 }),
        buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0', allocatedBytes: 300 }),
      ],
      advice: [buildAdvice({ path: '/fixture/store' })],
    });

    expect(totals).toEqual([
      { sectionKey: 'caches', allocatedBytes: 300, itemCount: 2, safeBytes: 100, adviceCount: 0 },
      {
        sectionKey: 'developerTools',
        allocatedBytes: 300,
        itemCount: 1,
        safeBytes: 0,
        adviceCount: 1,
      },
      { sectionKey: 'largeFiles', allocatedBytes: 400, itemCount: 1, safeBytes: 0, adviceCount: 0 },
    ]);
  });
});
