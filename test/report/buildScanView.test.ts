import { expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { ScanView } from '../../src/report/buildScanView.js';
import { buildScanView } from '../../src/report/buildScanView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { Advice, Candidate, CandidateDecision } from '../../src/scan/candidate.js';
import type { ScanIssue } from '../../src/scan/issue.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';
import { buildTestAbsolutePath, buildTestUdid } from '../support/parsedValueFixtures.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';
import { EMPTY_REPORT } from '../support/scanReportFixtures.js';

const MIB = 1_048_576;

const TEXTS = darwinPlatform.report;

const SIMULATOR_UDID = '0A1B2C3D-0000-4000-8000-000000000001';

function buildSimulatorCandidate(): Candidate {
  const path = `/Users/me/Library/Developer/CoreSimulator/Devices/${SIMULATOR_UDID}`;

  return {
    path: path,
    title: 'Simulator iPhone 15',
    category: 'developer',
    risk: 'review',
    origin: 'explore',
    explanation: 'A simulated device whose runtime is gone.',
    regeneration: 'Xcode creates a new one when you add it again.',
    allocatedBytes: 3 * MIB,
    entryCount: 1,
    isComplete: true,
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

function buildAdvice(params: { path: string; title: string; allocatedBytes: number }): Advice {
  return {
    path: params.path,
    title: params.title,
    category: 'packages',
    risk: 'review',
    explanation: 'Packages the tool keeps for its projects.',
    advice: 'Run the tool prune command.',
    allocatedBytes: params.allocatedBytes,
    isComplete: true,
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
  test('shows an empty scan as its summary alone', () => {
    expect(
      buildScanView({ report: EMPTY_REPORT, fullDiskAccessHolder: 'app', texts: TEXTS }),
    ).toEqual({
      summary: { titleText: 'Nothing to delete was found.', lines: [] },
      sections: [],
      explore: null,
      safeNumbers: [],
      skipped: null,
      notices: [],
    });
  });

  test('gives the scanned event of the protocol fixture for the scan it shows', async () => {
    const report = buildRankedReport({
      candidates: [
        buildSimulatorCandidate(),
        buildTestCandidate({
          path: '/Users/me/Movies/holiday.mov',
          title: 'Old video',
          category: 'userFiles',
          risk: 'careful',
          explanation: 'A large file unchanged for 180 days.',
          regeneration: 'It does not come back.',
          allocatedBytes: 3 * MIB,
        }),
        buildTestCandidate({
          path: '/Applications/Xcode.app',
          title: 'Xcode',
          category: 'applications',
          risk: 'never',
          explanation: "Apple's developer app, which other developer tools need.",
          regeneration: 'Installing it again takes a long download.',
          allocatedBytes: 2 * MIB,
        }),
        buildTestCandidate({
          path: '/Users/me/Library/Caches/com.example.other',
          title: 'App cache',
          category: 'caches',
          risk: 'review',
          explanation: 'Files an app keeps to work faster.',
          regeneration: 'The app builds them again, which can take a while.',
          allocatedBytes: 4 * MIB,
          isComplete: false,
        }),
        buildTestCandidate({
          path: '/Users/me/Library/Caches/ToolCache',
          title: 'Tool cache',
          category: 'caches',
          risk: 'safe',
          explanation: 'Files the tool keeps to work faster.',
          regeneration: 'The tool downloads them again when it needs them.',
          allocatedBytes: 6 * MIB,
        }),
      ],
      advice: [
        buildAdvice({
          path: '/Users/me/Library/ToolStore',
          title: 'Tool store',
          allocatedBytes: 6 * MIB,
        }),
      ],
      issues: [
        { path: '/Users/me/Library/Mail', reason: 'privacyDenied', detail: 'EPERM' },
        { path: '/Users/me/Projects/locked', reason: 'permissionDenied', detail: 'EACCES' },
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
        path: `/Users/me/small-${i}`,
        reason: 'belowSizeThreshold' as const,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        path: `/Users/me/busy-${i}`,
        reason: 'ownerRunning' as const,
      })),
    ];
    const fixtureEvent = await loadProtocolFixtureEventOfKind('scanned');

    const view = buildScanView({
      texts: TEXTS,
      report: { ...report, skipped: skipped },
      fullDiskAccessHolder: 'app',
    });

    expect<unknown>({ kind: 'scanned', ...view }).toEqual(fixtureEvent);
  });

  test('puts a section of check items only into its closed check group', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/.Trash',
            title: 'Trash',
            category: 'trash',
            risk: 'review',
            allocatedBytes: 2 * MIB,
          }),
        ],
      }),
      fullDiskAccessHolder: 'app',
    });

    expect(view.sections).toEqual([
      {
        titleText: 'Trash',
        sizeText: '2.0 MiB',
        isInitiallyExpanded: false,
        items: [],
        checkGroup: {
          titleText: 'Check before deleting',
          items: [expect.objectContaining({ number: 1 })],
        },
      },
    ]);
    expect(view.safeNumbers).toEqual([]);
  });

  test('shows a never item in its check group and counts it in no space the summary names', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/Applications/Kept.app',
            title: 'Kept',
            category: 'applications',
            risk: 'never',
            allocatedBytes: 2 * MIB,
          }),
        ],
      }),
      fullDiskAccessHolder: 'app',
    });

    expect(view.summary).toEqual({ titleText: 'Found 1 item, 2.0 MiB in total', lines: [] });
    expect(view.sections.map((section) => section.titleText)).toEqual(['Apps']);
    expect(view.sections[0]?.checkGroup?.items).toEqual([
      {
        number: 1,
        title: 'Kept',
        risk: 'never',
        riskText: 'never',
        sizeText: '2.0 MiB',
        detailLines: [
          { kind: 'path', text: '/Applications/Kept.app' },
          { kind: 'explanation', text: 'A test item.' },
          { kind: 'regeneration', text: 'Rebuilt by the test.' },
        ],
      },
    ]);
  });

  test('shows Explore with advice only when the scan offered no Explore item', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: {
        ...EMPTY_REPORT,
        advice: [buildAdvice({ path: '/fixture/store', title: 'Tool store', allocatedBytes: MIB })],
      },
      fullDiskAccessHolder: 'app',
    });

    expect(view.summary).toEqual({ titleText: 'Nothing to delete was found.', lines: [] });
    expect(view.sections).toEqual([]);
    expect(view.explore).toEqual({
      titleText: 'Explore',
      introText:
        'Their own tools remove these, or the folder shown is deleted where a tool has no command for it. They are never selected for you; read the reasons first.',
      items: [],
      adviceGroup: {
        titleText: 'Handle these yourself; this tool never deletes them',
        items: [
          {
            title: 'Tool store',
            risk: 'review',
            riskText: 'review',
            sizeText: '1.0 MiB',
            detailLines: [
              { kind: 'path', text: '/fixture/store' },
              { kind: 'explanation', text: 'Packages the tool keeps for its projects.' },
              { kind: 'advice', text: 'Run the tool prune command.' },
            ],
          },
        ],
      },
    });
  });

  test('reads an incomplete size as at least in its item, its section, and the summary', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/a',
            title: 'Partly read',
            category: 'caches',
            risk: 'safe',
            allocatedBytes: MIB,
            isComplete: false,
          }),
          buildTestCandidate({
            path: '/fixture/b',
            title: 'Fully read',
            category: 'caches',
            risk: 'safe',
            allocatedBytes: MIB,
          }),
        ],
      }),
      fullDiskAccessHolder: 'app',
    });

    expect(view.summary).toEqual({
      titleText: 'Found 2 items, at least 2.0 MiB in total',
      lines: ['at least 2.0 MiB safe to free'],
    });
    expect(view.sections[0]?.sizeText).toBe('at least 2.0 MiB');
    expect(view.sections[0]?.items.map((item) => item.sizeText)).toEqual([
      'at least 1.0 MiB',
      '1.0 MiB',
    ]);
  });

  test('numbers ascend top to bottom across the sections and Explore', () => {
    const report = buildRankedReport({
      candidates: [
        buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0', allocatedBytes: 9 * MIB }),
        buildTestCandidate({
          path: '/fixture/.Trash',
          title: 'Trash',
          category: 'trash',
          risk: 'safe',
          allocatedBytes: 8 * MIB,
        }),
        buildTestCandidate({
          path: '/fixture/movie.mov',
          title: 'Movie',
          category: 'userFiles',
          risk: 'careful',
          allocatedBytes: 7 * MIB,
        }),
        buildTestCandidate({
          path: '/fixture/node_modules',
          title: 'Build folder',
          category: 'projects',
          risk: 'review',
          allocatedBytes: 6 * MIB,
        }),
        buildTestCandidate({
          path: '/fixture/Library/Caches/Tool',
          title: 'Tool cache',
          category: 'caches',
          risk: 'review',
          allocatedBytes: 5 * MIB,
        }),
        buildTestCandidate({
          path: '/fixture/tmp/build',
          title: 'Temporary files',
          category: 'temporary',
          risk: 'safe',
          allocatedBytes: MIB,
        }),
      ],
    });

    const view = buildScanView({ report: report, fullDiskAccessHolder: 'app', texts: TEXTS });

    expect(listNumbersTopToBottom({ view: view })).toEqual([1, 2, 3, 4, 5, 6]);
    expect(view.sections.map((section) => section.titleText)).toEqual([
      'Caches',
      'Developer tools',
      'Large files',
      'Trash',
    ]);
    expect(view.safeNumbers).toEqual([1, 5]);
    expect(view.summary.lines).toEqual([
      '9.0 MiB safe to free',
      '18 MiB to check before deleting',
      '9.0 MiB in Explore',
    ]);
  });

  test('names no Full Disk Access and links no Settings pane for a denial by permissions', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: {
        ...EMPTY_REPORT,
        issues: [{ path: '/fixture/locked', reason: 'permissionDenied', detail: 'EACCES' }],
      },
      fullDiskAccessHolder: 'app',
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

    const appView = buildScanView({ report: report, fullDiskAccessHolder: 'app', texts: TEXTS });
    const terminalView = buildScanView({
      report: report,
      fullDiskAccessHolder: 'terminal',
      texts: TEXTS,
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

  test('writes out control characters in every text that comes from outside', () => {
    const view = buildScanView({
      texts: TEXTS,
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/fixture/movie\n.mov',
            title: 'movie\u001b[2J',
            category: 'userFiles',
            risk: 'careful',
            explanation: 'Explained\r',
            regeneration: 'Gone‮',
            allocatedBytes: MIB,
          }),
        ],
        advice: [buildAdvice({ path: '/fixture/store\t', title: 'Store\n', allocatedBytes: MIB })],
      }),
      fullDiskAccessHolder: 'app',
    });

    expect(view.sections[0]?.checkGroup?.items[0]).toMatchObject({
      title: 'movie\\u{1b}[2J',
      detailLines: [
        { kind: 'path', text: '/fixture/movie\\u{a}.mov' },
        { kind: 'explanation', text: 'Explained\\u{d}' },
        { kind: 'regeneration', text: 'Gone\\u{202e}' },
      ],
    });
    expect(view.explore?.adviceGroup?.items[0]).toMatchObject({
      title: 'Store\\u{a}',
      detailLines: [
        expect.objectContaining({ text: '/fixture/store\\u{9}' }),
        expect.anything(),
        expect.anything(),
      ],
    });
  });
});
