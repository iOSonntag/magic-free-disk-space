import { expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { buildPlannedFacts } from '../../src/report/buildPlannedFacts.js';
import { formatDeletionWarningLines } from '../../src/report/formatDeletionConfirmation.js';
import { formatRemovalPlan } from '../../src/report/formatRemovalPlan.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';
import {
  buildProtocolFixturePlan,
  buildProtocolFixtureReport,
} from '../support/protocolFixtureScan.js';

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
  isComplete: false,
});

const TOOL_VERSION = buildTestToolCandidate({
  homeDir: '/fixture',
  version: '20.1.0',
  risk: 'careful',
  allocatedBytes: 2000,
});

const RANKED = [SAFE_CACHE, OLD_VIDEO, TOOL_VERSION];

describeAwaitingWin32Platform('buildPlannedFacts', () => {
  test('gives the planned event of the protocol fixture for the plan it shows', async () => {
    const plan = buildProtocolFixturePlan();

    expect<unknown>({
      kind: 'planned',
      planId: 1,
      lines: formatRemovalPlan({ plan: plan }),
      warningLines: formatDeletionWarningLines({ texts: darwinPlatform.report }),
      ...buildPlannedFacts({ plan: plan, ranked: buildProtocolFixtureReport().candidates }),
    }).toEqual(await loadProtocolFixtureEventOfKind('planned'));
  });

  test('numbers each approved item by its scan, with its key, section, group, risk, removal, and size', () => {
    expect<unknown>(
      buildPlannedFacts({
        plan: { approved: [OLD_VIDEO, SAFE_CACHE, TOOL_VERSION], refused: [] },
        ranked: RANKED,
      }),
    ).toEqual({
      items: [
        {
          number: 2,
          key: 'catalog:test-entry:/fixture/movie.mov',
          title: 'movie\\u{a}.mov',
          sectionKey: 'largeFiles',
          group: 'careful',
          risk: 'careful',
          removal: 'delete',
          allocatedBytes: 3000,
          isComplete: false,
        },
        {
          number: 1,
          key: 'catalog:test-entry:/fixture/cache',
          title: 'Tool cache',
          sectionKey: 'caches',
          group: 'safe',
          risk: 'safe',
          removal: 'delete',
          allocatedBytes: 1000,
          isComplete: true,
        },
        {
          number: 3,
          key: 'explore:miseVersions:miseVersion:node@20.1.0',
          title: TOOL_VERSION.title,
          sectionKey: 'developerTools',
          group: 'careful',
          risk: 'careful',
          removal: 'tool',
          allocatedBytes: 2000,
          isComplete: true,
        },
      ],
      totalBytes: 6000,
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

  test('gives a safe item a probe found the review group its scan shows it in', () => {
    const probedSafeVersion = buildTestToolCandidate({
      homeDir: '/fixture',
      version: '18.0.0',
      risk: 'safe',
    });

    const facts = buildPlannedFacts({
      plan: { approved: [probedSafeVersion], refused: [] },
      ranked: [probedSafeVersion],
    });

    expect(facts.items.map((item) => [item.risk, item.group])).toEqual([['safe', 'review']]);
    expect(facts.holdsCareful).toBe(false);
  });

  test('throws for an approved item outside the ranking of its scan', () => {
    expect(() =>
      buildPlannedFacts({ plan: { approved: [SAFE_CACHE], refused: [] }, ranked: [OLD_VIDEO] }),
    ).toThrow('not part of the ranking');
  });
});
