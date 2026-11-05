import { expect, test } from 'bun:test';
import { buildPlannedFacts } from '../../src/report/buildPlannedFacts.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';

const SAFE_CACHE = buildTestCandidate({
  path: '/fixture/cache',
  title: 'Tool cache',
  risk: 'safe',
  allocatedBytes: 1000,
});

const OLD_VIDEO = buildTestCandidate({
  path: '/fixture/movie.mov',
  title: 'movie\n.mov',
  category: 'userFiles',
  risk: 'careful',
  allocatedBytes: 3000,
});

const TOOL_VERSION = buildTestToolCandidate({
  homeDir: '/fixture',
  version: '20.1.0',
  risk: 'careful',
  allocatedBytes: 2000,
});

const RANKED = [SAFE_CACHE, OLD_VIDEO, TOOL_VERSION];

describeAwaitingWin32Platform('buildPlannedFacts', () => {
  test('numbers each approved item by its scan, with its key, section, risk, and size', () => {
    expect<unknown>(
      buildPlannedFacts({
        plan: { approved: [OLD_VIDEO, SAFE_CACHE], refused: [] },
        ranked: RANKED,
      }),
    ).toEqual({
      items: [
        {
          number: 2,
          key: 'catalog:test-entry:/fixture/movie.mov',
          title: 'movie\\u{a}.mov',
          sectionKey: 'largeFiles',
          risk: 'careful',
          allocatedBytes: 3000,
        },
        {
          number: 1,
          key: 'catalog:test-entry:/fixture/cache',
          title: 'Tool cache',
          sectionKey: 'caches',
          risk: 'safe',
          allocatedBytes: 1000,
        },
      ],
      totalBytes: 4000,
      holdsCareful: true,
    });
  });

  test('holds careful for a careful item a probe found, and not for safe items alone', () => {
    expect(
      buildPlannedFacts({ plan: { approved: [TOOL_VERSION], refused: [] }, ranked: RANKED }),
    ).toMatchObject({ holdsCareful: true });
    expect(
      buildPlannedFacts({ plan: { approved: [SAFE_CACHE], refused: [] }, ranked: RANKED }),
    ).toMatchObject({ holdsCareful: false, totalBytes: 1000 });
  });

  test('throws for an approved item outside the ranking of its scan', () => {
    expect(() =>
      buildPlannedFacts({ plan: { approved: [SAFE_CACHE], refused: [] }, ranked: [OLD_VIDEO] }),
    ).toThrow('not part of the ranking');
  });
});
