import { expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { ScanView } from '../../src/report/buildScanView.js';
import { buildScanView } from '../../src/report/buildScanView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { Advice, Candidate, CandidateDecision } from '../../src/scan/candidate.js';
import type { ScanIssue } from '../../src/scan/issue.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { VolumeSpace } from '../../src/system/volumeSpace.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestToolCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';
import {
  buildTestAbsolutePath,
  buildTestMacBundleId,
  buildTestUdid,
} from '../support/parsedValueFixtures.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';
import { EMPTY_REPORT } from '../support/scanReportFixtures.js';

const MB = 1_000_000;

const TEXTS = darwinPlatform.report;

const HOME_DIR = '/Users/me';

const DISK: VolumeSpace = { capacityBytes: 500_000_000_000, availableBytes: 52_000_000_000 };

const SIMULATOR_UDID = '0A1B2C3D-0000-4000-8000-000000000001';

function buildSimulatorCandidate(): Candidate {
  const path = `${HOME_DIR}/Library/Developer/CoreSimulator/Devices/${SIMULATOR_UDID}`;

  return {
    path: path,
    title: 'Simulator iPhone 15',
    category: 'developer',
    risk: 'review',
    origin: { kind: 'explore', probe: 'simulatorDevices' },
    explanation: 'A simulated device whose runtime is gone.',
    regeneration: 'Xcode creates a new one when you add it again.',
    allocatedBytes: 3 * MB,
    entryCount: 1,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'simulatorDevice',
        tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
        udid: buildTestUdid({ text: SIMULATOR_UDID }),
        dataPath: buildTestAbsolutePath({ text: path }),
      },
    },
    evidenceLines: ['Its runtime iOS 17.0 is no longer installed.'],
  };
}

function buildAdvice(params: {
  path: string;
  title: string;
  allocatedBytes: number;
  privateSizeFallbackCount?: number;
}): Advice {
  return {
    origin: { kind: 'catalog', entryId: 'tool-store' },
    path: params.path,
    title: params.title,
    category: 'packages',
    risk: 'review',
    explanation: 'Packages the tool keeps for its projects.',
    advice: 'Run the tool prune command.',
    allocatedBytes: params.allocatedBytes,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
    privateSizeFallbackCount: params.privateSizeFallbackCount ?? 0,
  };
}

/** Ranks the candidates as a scan does, so their numbers are those of a real report. */
function buildRankedReport(params: {
  candidates: Candidate[];
  advice?: Advice[];
  issues?: ScanIssue[];
}): ScanReport {
  const offers = params.candidates.map(
    (candidate): CandidateDecision => ({ kind: 'offer', candidate: candidate }),
  );
  const advice = (params.advice ?? []).map(
    (item): CandidateDecision => ({ kind: 'advice', advice: item }),
  );

  return buildScanReport({ decisions: [...offers, ...advice], issues: params.issues ?? [] });
}

function buildView(params: { report: ScanReport; disk?: VolumeSpace | null }): ScanView {
  return buildScanView({
    report: params.report,
    fullDiskAccessHolder: 'app',
    texts: TEXTS,
    homeDir: HOME_DIR,
    disk: params.disk ?? null,
  });
}

/** The scan the `scanned` event of the protocol fixture shows: one item of every origin. */
function buildProtocolFixtureReport(): ScanReport {
  const report = buildRankedReport({
    candidates: [
      buildSimulatorCandidate(),
      buildTestCandidate({
        path: `${HOME_DIR}/Movies/holiday.mov`,
        title: 'Old video',
        category: 'userFiles',
        risk: 'careful',
        explanation: 'A large file unchanged for 180 days.',
        regeneration: 'It does not come back.',
        allocatedBytes: 3 * MB,
        origin: { kind: 'userFile' },
        lastUsedAtMs: Date.UTC(2025, 5, 1),
        downloadedAtMs: Date.UTC(2024, 11, 24),
      }),
      buildTestCandidate({
        path: '/Applications/Xcode.app',
        title: 'Xcode',
        category: 'applications',
        risk: 'never',
        explanation: "Apple's developer app, which other developer tools need.",
        regeneration: 'Installing it again takes a long download.',
        allocatedBytes: 2 * MB,
        origin: {
          kind: 'application',
          bundleId: buildTestMacBundleId({ text: 'com.apple.dt.Xcode' }),
        },
        lastUsedAtMs: Date.UTC(2025, 2, 15),
        appName: 'Xcode',
      }),
      buildTestCandidate({
        path: `${HOME_DIR}/Library/Containers/com.example.removed`,
        title: 'Data of an app that is no longer installed (com.example.removed)',
        category: 'leftovers',
        risk: 'careful',
        explanation: 'The sandbox container of an app that is not installed.',
        regeneration: 'Not regenerated.',
        allocatedBytes: MB,
        origin: { kind: 'leftover', matchedBy: 'bundleId' },
        lastUsedAtMs: Date.UTC(2025, 0, 10),
      }),
      buildTestCandidate({
        path: `${HOME_DIR}/Library/Caches/com.example.other`,
        title: 'App cache',
        category: 'caches',
        risk: 'review',
        explanation: 'Files an app keeps to work faster.',
        regeneration: 'The app builds them again, which can take a while.',
        allocatedBytes: 4 * MB,
        isComplete: false,
        origin: { kind: 'catalog', entryId: 'app-cache' },
        appName: 'Example',
      }),
      buildTestCandidate({
        path: `${HOME_DIR}/Library/Caches/ToolCache`,
        title: 'Tool cache',
        category: 'caches',
        risk: 'safe',
        explanation: 'Files the tool keeps to work faster.',
        regeneration: 'The tool downloads them again when it needs them.',
        allocatedBytes: 6 * MB,
        origin: { kind: 'catalog', entryId: 'tool-cache' },
      }),
    ],
    advice: [
      buildAdvice({
        path: `${HOME_DIR}/Library/ToolStore`,
        title: 'Tool store',
        allocatedBytes: 6 * MB,
        privateSizeFallbackCount: 2,
      }),
    ],
    issues: [
      { path: `${HOME_DIR}/Library/Mail`, reason: 'privacyDenied', detail: 'EPERM' },
      { path: `${HOME_DIR}/Projects/locked`, reason: 'permissionDenied', detail: 'EACCES' },
      {
        path: '/opt/homebrew/bin/brew',
        reason: 'toolFailed',
        failure: {
          reason: 'commandFailed',
          failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: '' },
        },
      },
    ],
  });
  const skipped: ScanReport['skipped'] = [
    ...Array.from({ length: 9 }, (_, i) => ({
      path: `${HOME_DIR}/small-${i}`,
      reason: 'belowSizeThreshold' as const,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      path: `${HOME_DIR}/busy-${i}`,
      reason: 'ownerRunning' as const,
    })),
  ];

  return { ...report, skipped: skipped };
}

/** Every number of the view, top to bottom as the app and the CLI show them. */
function listNumbersTopToBottom(params: { view: ScanView }): number[] {
  const sectionNumbers = params.view.sections.flatMap((section) => [
    ...section.items.map((item) => item.number),
    ...(section.checkGroup?.items ?? []).map((item) => item.number),
  ]);
  const exploreNumbers = (params.view.explore?.items ?? []).map((item) => item.number);

  return [...sectionNumbers, ...exploreNumbers];
}

describeAwaitingWin32Platform('buildScanView', () => {
  test('shows an empty scan as its summary alone, with the disk it read', () => {
    expect(buildView({ report: EMPTY_REPORT, disk: DISK })).toEqual({
      summary: {
        titleText: 'Nothing to delete was found.',
        lines: [],
        totalBytes: 0,
        safeBytes: 0,
        disk: DISK,
      },
      sections: [],
      explore: null,
      safeNumbers: [],
      skipped: null,
      notices: [],
      sectionTotals: [],
    });
  });

  test('gives the scanned event of the protocol fixture for the scan it shows', async () => {
    const fixtureEvent = await loadProtocolFixtureEventOfKind('scanned');

    const view = buildView({ report: buildProtocolFixtureReport(), disk: DISK });

    expect<unknown>({ kind: 'scanned', ...view }).toEqual(fixtureEvent);
  });

  test('puts a section of check items only into its closed check group', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/.Trash',
            title: 'Trash',
            category: 'trash',
            risk: 'review',
            allocatedBytes: 2 * MB,
          }),
        ],
      }),
    });

    expect(view.sections).toEqual([
      {
        key: 'trash',
        titleText: 'Trash',
        sizeText: '2.0 MB',
        isInitiallyExpanded: false,
        items: [],
        checkGroup: {
          titleText: 'Check before deleting',
          items: [expect.objectContaining({ number: 1, group: 'review', origin: 'trash' })],
        },
      },
    ]);
    expect(view.safeNumbers).toEqual([]);
  });

  test('shows a never item in its check group and counts it in no space the summary names', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/Applications/Kept.app',
            title: 'Kept',
            category: 'applications',
            risk: 'never',
            allocatedBytes: 2 * MB,
          }),
        ],
      }),
    });

    expect(view.summary).toEqual({
      titleText: 'Found 1 item, 2.0 MB in total',
      lines: [],
      totalBytes: 2 * MB,
      safeBytes: 0,
      disk: null,
    });
    expect(view.sections.map((section) => section.titleText)).toEqual(['Apps']);
    expect<unknown>(view.sections[0]?.checkGroup?.items).toEqual([
      {
        number: 1,
        key: 'catalog:test-entry:/Applications/Kept.app',
        title: 'Kept',
        risk: 'never',
        riskText: 'never',
        sizeText: '2.0 MB',
        detailLines: [
          { kind: 'path', text: '/Applications/Kept.app' },
          { kind: 'explanation', text: 'A test item.' },
          { kind: 'regeneration', text: 'Rebuilt by the test.' },
        ],
        sectionKey: 'apps',
        group: 'review',
        origin: 'catalog',
        removal: 'delete',
        allocatedBytes: 2 * MB,
        isComplete: true,
        displayPath: '/Applications/Kept.app',
        revealPath: '/Applications/Kept.app',
        lastUsedAt: null,
        downloadedAt: null,
        appName: null,
        matchedBy: null,
      },
    ]);
  });

  test('groups review before careful under the check group of one section', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/Library/Caches/Big',
            title: 'Big careful',
            risk: 'careful',
            allocatedBytes: 9 * MB,
          }),
          buildTestCandidate({
            path: '/fixture/Library/Caches/Small',
            title: 'Small review',
            risk: 'review',
            allocatedBytes: MB,
          }),
        ],
      }),
    });

    expect(
      view.sections[0]?.checkGroup?.items.map((item) => [item.number, item.title, item.group]),
    ).toEqual([
      [1, 'Small review', 'review'],
      [2, 'Big careful', 'careful'],
    ]);
  });

  test('shows a safe item a probe found under Explore, in the review group of its section', () => {
    const toolCandidate = buildTestToolCandidate({
      homeDir: HOME_DIR,
      version: '20.1.0',
      allocatedBytes: 2 * MB,
    });
    const view = buildView({ report: buildRankedReport({ candidates: [toolCandidate] }) });

    expect(view.sections).toEqual([]);
    expect(view.explore?.items).toEqual([
      expect.objectContaining({
        number: 1,
        key: 'explore:miseVersions:miseVersion:node@20.1.0',
        sectionKey: 'developerTools',
        group: 'review',
        origin: 'explore',
        removal: 'tool',
        displayPath: '~/.local/share/mise/installs/node/20.1.0',
        revealPath: `${HOME_DIR}/.local/share/mise/installs/node/20.1.0`,
      }),
    ]);
    expect(view.summary.safeBytes).toBe(0);
    expect(view.sectionTotals).toEqual([
      {
        sectionKey: 'developerTools',
        allocatedBytes: 2 * MB,
        itemCount: 1,
        safeBytes: 0,
        adviceCount: 0,
      },
    ]);
  });

  test('shows Explore with advice only when the scan offered no Explore item', () => {
    const view = buildView({
      report: {
        ...EMPTY_REPORT,
        advice: [
          buildAdvice({ path: `${HOME_DIR}/store`, title: 'Tool store', allocatedBytes: MB }),
        ],
      },
    });

    expect(view.summary).toEqual({
      titleText: 'Nothing to delete was found.',
      lines: [],
      totalBytes: 0,
      safeBytes: 0,
      disk: null,
    });
    expect(view.sections).toEqual([]);
    expect<unknown>(view.explore).toEqual({
      titleText: 'Explore',
      introText:
        'Their own tools remove these, or the folder shown is deleted where a tool has no command for it. They are never selected for you; read the reasons first.',
      items: [],
      adviceGroup: {
        titleText: 'Handle these yourself; this tool never deletes them',
        items: [
          {
            key: `catalog:tool-store:${HOME_DIR}/store`,
            title: 'Tool store',
            risk: 'review',
            riskText: 'review',
            sizeText: '1.0 MB',
            detailLines: [
              { kind: 'path', text: `${HOME_DIR}/store` },
              { kind: 'explanation', text: 'Packages the tool keeps for its projects.' },
              { kind: 'advice', text: 'Run the tool prune command.' },
            ],
            sectionKey: 'developerTools',
            origin: 'catalog',
            removal: 'advice',
            allocatedBytes: MB,
            displayPath: '~/store',
            revealPath: `${HOME_DIR}/store`,
            opener: null,
          },
        ],
      },
    });
    expect(view.sectionTotals).toEqual([
      {
        sectionKey: 'developerTools',
        allocatedBytes: 0,
        itemCount: 0,
        safeBytes: 0,
        adviceCount: 1,
      },
    ]);
  });

  test('reads an incomplete size as at least in its item, its section, and the summary', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/a',
            title: 'Partly read',
            category: 'caches',
            risk: 'safe',
            allocatedBytes: MB,
            isComplete: false,
          }),
          buildTestCandidate({
            path: '/fixture/b',
            title: 'Fully read',
            category: 'caches',
            risk: 'safe',
            allocatedBytes: MB,
          }),
        ],
      }),
    });

    expect(view.summary).toMatchObject({
      titleText: 'Found 2 items, at least 2.0 MB in total',
      lines: ['at least 2.0 MB safe to free'],
      totalBytes: 2 * MB,
      safeBytes: 2 * MB,
    });
    expect(view.sections[0]?.sizeText).toBe('at least 2.0 MB');
    expect(view.sections[0]?.items.map((item) => [item.sizeText, item.isComplete])).toEqual([
      ['at least 1.0 MB', false],
      ['1.0 MB', true],
    ]);
  });

  test('numbers ascend top to bottom across the sections and Explore', () => {
    const report = buildRankedReport({
      candidates: [
        buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0', allocatedBytes: 9 * MB }),
        buildTestCandidate({
          path: '/fixture/.Trash',
          title: 'Trash',
          category: 'trash',
          risk: 'safe',
          allocatedBytes: 8 * MB,
        }),
        buildTestCandidate({
          path: '/fixture/movie.mov',
          title: 'Movie',
          category: 'userFiles',
          risk: 'careful',
          allocatedBytes: 7 * MB,
        }),
        buildTestCandidate({
          path: '/fixture/node_modules',
          title: 'Build folder',
          category: 'projects',
          risk: 'review',
          allocatedBytes: 6 * MB,
        }),
        buildTestCandidate({
          path: '/fixture/Library/Caches/Tool',
          title: 'Tool cache',
          category: 'caches',
          risk: 'review',
          allocatedBytes: 5 * MB,
        }),
        buildTestCandidate({
          path: '/fixture/tmp/build',
          title: 'Temporary files',
          category: 'temporary',
          risk: 'safe',
          allocatedBytes: MB,
        }),
      ],
    });

    const view = buildView({ report: report });

    expect(listNumbersTopToBottom({ view: view })).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.sections.map((section) => section.titleText)).toEqual([
      'Caches',
      'Projects',
      'Large files',
      'Trash',
    ]);
    expect(view.sections.map((section) => section.key)).toEqual([
      'caches',
      'projects',
      'largeFiles',
      'trash',
    ]);
    expect(view.safeNumbers).toEqual([1, 5]);
    expect(view.summary.lines).toEqual([
      '9.0 MB safe to free',
      '18 MB to check before deleting',
      '9.0 MB in Explore',
    ]);
    expect(view.summary).toMatchObject({ totalBytes: 36 * MB, safeBytes: 9 * MB });
  });

  test('names no Full Disk Access and links no Settings pane for a denial by permissions', () => {
    const view = buildView({
      report: {
        ...EMPTY_REPORT,
        issues: [{ path: '/fixture/locked', reason: 'permissionDenied', detail: 'EACCES' }],
      },
    });

    expect(view.notices).toEqual([
      {
        titleText: 'Could not read 1 place',
        lines: ['/fixture/locked: permission denied (EACCES)'],
        settingsLink: null,
      },
    ]);
  });

  test('names Full Disk Access for its holder and links its Settings pane after a privacy denial', () => {
    const report: ScanReport = {
      ...EMPTY_REPORT,
      issues: [{ path: '/fixture/Mail', reason: 'privacyDenied', detail: 'EPERM' }],
    };

    const appView = buildView({ report: report });
    const terminalView = buildScanView({
      report: report,
      fullDiskAccessHolder: 'terminal',
      texts: TEXTS,
      homeDir: HOME_DIR,
      disk: null,
    });

    expect(appView.notices).toEqual([
      {
        titleText: 'Could not read 1 place',
        lines: [
          '/fixture/Mail: blocked by macOS privacy protection (EPERM)',
          'Give this app Full Disk Access in System Settings > Privacy & Security to scan protected folders.',
        ],
        settingsLink: FULL_DISK_ACCESS_SETTINGS_LINK,
      },
    ]);
    expect(terminalView.notices[0]?.lines.at(-1)).toBe(
      'Give your terminal Full Disk Access in System Settings > Privacy & Security to scan protected folders.',
    );
  });

  test('adds one notice for the sizes that count every block, summed over items and advice', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({ path: '/fixture/a', privateSizeFallbackCount: 2 }),
          buildTestCandidate({ path: '/fixture/b', privateSizeFallbackCount: 0 }),
        ],
        advice: [
          buildAdvice({
            path: '/fixture/store',
            title: 'Tool store',
            allocatedBytes: MB,
            privateSizeFallbackCount: 1,
          }),
        ],
      }),
    });

    expect(view.notices).toEqual([
      {
        titleText: 'Some sizes may be larger than the space they free',
        lines: [
          'macOS did not give the private size of 3 entries, so their full size counts, which may include space they share with a copy.',
        ],
        settingsLink: null,
      },
    ]);
  });

  test('adds no fallback notice when every private size was read', () => {
    const view = buildView({
      report: buildRankedReport({ candidates: [buildTestCandidate({ path: '/fixture/a' })] }),
    });

    expect(view.notices).toEqual([]);
  });

  test('writes out control characters in every text that comes from outside', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: `${HOME_DIR}/movie\n.mov`,
            title: 'movie\u001b[2J',
            category: 'userFiles',
            risk: 'careful',
            explanation: 'Explained\r',
            regeneration: 'Gone‮',
            allocatedBytes: MB,
            appName: 'App\u0007',
          }),
        ],
        advice: [buildAdvice({ path: '/fixture/store\t', title: 'Store\n', allocatedBytes: MB })],
      }),
    });

    expect(view.sections[0]?.checkGroup?.items[0]).toMatchObject({
      title: 'movie\\u{1b}[2J',
      detailLines: [
        { kind: 'path', text: `${HOME_DIR}/movie\\u{a}.mov` },
        { kind: 'explanation', text: 'Explained\\u{d}' },
        { kind: 'regeneration', text: 'Gone\\u{202e}' },
      ],
      displayPath: '~/movie\\u{a}.mov',
      revealPath: `${HOME_DIR}/movie\n.mov`,
      appName: 'App\\u{7}',
    });
    expect(view.explore?.adviceGroup?.items[0]).toMatchObject({
      title: 'Store\\u{a}',
      detailLines: [
        expect.objectContaining({ text: '/fixture/store\\u{9}' }),
        expect.anything(),
        expect.anything(),
      ],
      displayPath: '/fixture/store\\u{9}',
    });
  });
});
