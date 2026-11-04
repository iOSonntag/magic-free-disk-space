import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { WIN32_REPORT_TEXTS } from '../../src/platform/win32/reportTexts.js';
import type { ScanView } from '../../src/report/buildScanView.js';
import { buildScanProgressView, buildScanView } from '../../src/report/buildScanView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import { buildSectionTotals } from '../../src/scan/buildSectionTotals.js';
import type { Advice, Candidate, CandidateDecision } from '../../src/scan/candidate.js';
import type { ScanIssue } from '../../src/scan/issue.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { VolumeSpace } from '../../src/system/volumeSpace.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import {
  buildTestAdvice,
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import { buildExampleHome, buildTestWindowsPath } from '../support/parsedValueFixtures.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';
import {
  buildProtocolFixtureReport,
  PROTOCOL_FIXTURE_DISK,
  PROTOCOL_FIXTURE_HOME_DIR,
} from '../support/protocolFixtureScan.js';
import { EMPTY_REPORT } from '../support/scanReportFixtures.js';

const MB = 1_000_000;

const TEXTS = darwinPlatform.report;

const HOME_DIR = PROTOCOL_FIXTURE_HOME_DIR;

const HOME = buildExampleHome({ text: HOME_DIR });

// The fixture of the bridge's events is the scan of a macOS home, and a path below a home reads
// as `~/…` only with the separator of macOS, which the display path takes from the host.
const testOnDarwin = test.skipIf(process.platform !== 'darwin');

function buildAdvice(params: {
  path: string;
  title: string;
  allocatedBytes: number;
  privateSizeFallbackCount?: number;
}): Advice {
  return buildTestAdvice({
    origin: { kind: 'catalog', entryId: 'tool-store' },
    path: params.path,
    title: params.title,
    category: 'packages',
    explanation: 'Packages the tool keeps for its projects.',
    advice: 'Run the tool prune command.',
    allocatedBytes: params.allocatedBytes,
    privateSizeFallbackCount: params.privateSizeFallbackCount ?? 0,
  });
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

  return buildScanReport({
    decisions: [...offers, ...advice],
    appAdvice: [],
    evictedEntryCount: 0,
    issues: params.issues ?? [],
  });
}

function buildView(params: { report: ScanReport; disk?: VolumeSpace }): ScanView {
  return buildScanView({
    report: params.report,
    fullDiskAccessHolder: 'app',
    texts: TEXTS,
    homeDir: HOME_DIR,
    disk: params.disk ?? null,
  });
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

describe('buildScanView', () => {
  test('shows an empty scan as its summary alone, with the disk it read', () => {
    expect(buildView({ report: EMPTY_REPORT, disk: PROTOCOL_FIXTURE_DISK })).toEqual({
      summary: {
        titleText: 'Nothing to delete was found.',
        lines: [],
        totalBytes: 0,
        isTotalComplete: true,
        safeBytes: 0,
        isSafeComplete: true,
        disk: PROTOCOL_FIXTURE_DISK,
      },
      sections: [],
      explore: null,
      safeNumbers: [],
      skipped: null,
      notices: [],
      sectionTotals: [],
      appAdvice: null,
    });
  });

  test('shows the installed apps of advice beside the sections, unnumbered, with what is known', () => {
    const view = buildScanView({
      texts: WIN32_REPORT_TEXTS,
      report: {
        ...EMPTY_REPORT,
        appAdvice: [
          {
            displayName: 'Example\u001b[2J Editor',
            installFolderPath: 'C:\\Program Files\\Example Editor',
            estimatedBytes: 3 * MB,
          },
          { displayName: 'Example Tool', installFolderPath: null, estimatedBytes: null },
        ],
      },
      fullDiskAccessHolder: 'app',
      homeDir: HOME_DIR,
      disk: null,
    });

    expect(view.summary).toEqual({
      titleText: 'Nothing to delete was found.',
      lines: [],
      totalBytes: 0,
      isTotalComplete: true,
      safeBytes: 0,
      isSafeComplete: true,
      disk: null,
    });
    expect(view.safeNumbers).toEqual([]);
    expect(view.sectionTotals).toEqual([]);
    expect(view.appAdvice).toEqual({
      titleText: 'Installed apps',
      introText:
        'Uninstall the apps you no longer use in Settings > Apps; this tool never deletes an app.',
      items: [
        {
          title: 'Example\\u{1b}[2J Editor',
          risk: 'review',
          riskText: 'review',
          sizeText: '3.0 MB',
          detailLines: [
            { kind: 'path', text: 'C:\\Program Files\\Example Editor' },
            { kind: 'explanation', text: 'Installed on this PC, as Settings > Apps lists it.' },
            { kind: 'advice', text: 'Uninstall it in Settings > Apps if you no longer use it.' },
          ],
        },
        {
          title: 'Example Tool',
          risk: 'review',
          riskText: 'review',
          sizeText: 'size unknown',
          detailLines: [
            { kind: 'explanation', text: 'Installed on this PC, as Settings > Apps lists it.' },
            { kind: 'advice', text: 'Uninstall it in Settings > Apps if you no longer use it.' },
          ],
        },
      ],
    });
  });

  testOnDarwin(
    'gives the scanned event of the protocol fixture for the scan it shows',
    async () => {
      const fixtureEvent = await loadProtocolFixtureEventOfKind('scanned');

      const view = buildView({ report: buildProtocolFixtureReport(), disk: PROTOCOL_FIXTURE_DISK });

      expect<unknown>({ kind: 'scanned', ...view }).toEqual(fixtureEvent);
    },
  );

  test('counts the entries left in iCloud into the skipped items, on a line of their own', () => {
    const view = buildView({
      report: {
        ...EMPTY_REPORT,
        skipped: [{ path: '/Users/me/busy', reason: 'ownerRunning' }],
        evictedEntryCount: 4,
      },
    });

    expect(view.skipped).toEqual({
      titleText: 'Skipped 5 items',
      lines: ['its app or tool is running: 1', 'in iCloud, not on this Mac: 4'],
    });
  });

  test('names OneDrive and this PC for the entries left in the cloud store on Windows', () => {
    const view = buildScanView({
      texts: WIN32_REPORT_TEXTS,
      report: { ...EMPTY_REPORT, evictedEntryCount: 1 },
      fullDiskAccessHolder: 'app',
      homeDir: HOME_DIR,
      disk: null,
    });

    expect(view.skipped).toEqual({
      titleText: 'Skipped 1 item',
      lines: ['in OneDrive, not on this PC: 1'],
    });
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

  test('shows the Recycle Bin of a drive as an item of the Recycle Bin section, with no command', () => {
    const view = buildScanView({
      texts: WIN32_REPORT_TEXTS,
      report: buildRankedReport({
        candidates: [
          {
            path: 'C:\\$Recycle.Bin',
            title: 'Recycle Bin (C:)',
            category: 'trash',
            risk: 'careful',
            origin: { kind: 'recycleBin' },
            explanation: 'Files you deleted.',
            regeneration: 'None.',
            allocatedBytes: 2 * MB,
            entryCount: 3,
            isComplete: true,
            privateSizeFallbackCount: 0,
            lastUsedAtMs: null,
            downloadedAtMs: null,
            appName: null,
            removal: {
              kind: 'emptyRecycleBin',
              driveRootPath: buildTestWindowsPath({ text: 'C:\\' }),
              scannedContent: { sizeBytes: 2 * MB, itemCount: 3 },
            },
          },
        ],
      }),
      fullDiskAccessHolder: 'app',
      homeDir: HOME_DIR,
      disk: null,
    });

    expect<unknown>(view.sections).toEqual([
      {
        key: 'trash',
        titleText: 'Recycle Bin',
        sizeText: '2.0 MB',
        isInitiallyExpanded: false,
        items: [],
        checkGroup: {
          titleText: 'Check before deleting',
          items: [
            {
              number: 1,
              key: 'recycleBin:C:\\$Recycle.Bin',
              title: 'Recycle Bin (C:)',
              risk: 'careful',
              riskText: 'careful',
              sizeText: '2.0 MB',
              detailLines: [
                { kind: 'path', text: 'C:\\$Recycle.Bin' },
                { kind: 'explanation', text: 'Files you deleted.' },
                { kind: 'regeneration', text: 'None.' },
              ],
              sectionKey: 'trash',
              group: 'careful',
              origin: 'trash',
              removal: 'delete',
              allocatedBytes: 2 * MB,
              isComplete: true,
              displayPath: 'C:\\$Recycle.Bin',
              revealPath: 'C:\\$Recycle.Bin',
              lastUsedAt: null,
              downloadedAt: null,
              appName: null,
              matchedBy: null,
            },
          ],
        },
      },
    ]);
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
      totalBytes: 0,
      isTotalComplete: true,
      safeBytes: 0,
      isSafeComplete: true,
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

  test('counts in the space to free a review item but no never item, which the plan refuses', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({
            path: '/Applications/Xcode.app',
            category: 'applications',
            risk: 'never',
            allocatedBytes: 10_000 * MB,
          }),
          buildTestCandidate({
            path: '/fixture/Library/Caches/Tool',
            risk: 'review',
            allocatedBytes: 1000 * MB,
          }),
        ],
      }),
    });

    expect(view.summary).toMatchObject({
      titleText: 'Found 2 items, 11 GB in total',
      lines: ['1.0 GB to check before deleting'],
      totalBytes: 1000 * MB,
      safeBytes: 0,
    });
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

  testOnDarwin(
    'shows a safe item a probe found under Explore, in the review group of its section',
    () => {
      const toolCandidate = buildTestToolCandidate({
        home: HOME,
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
          isComplete: true,
          removableBytes: 2 * MB,
          isRemovableComplete: true,
          itemCount: 1,
          safeBytes: 0,
          adviceCount: 0,
          titleText: 'Developer tools',
        },
      ]);
    },
  );

  test('titles each section total as its section, the Trash by the name of the platform', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({ path: '/fixture/.Trash/old', category: 'trash' }),
          buildTestCandidate({ path: '/fixture/model', category: 'aiModels' }),
        ],
      }),
    });

    expect(view.sectionTotals.map((total) => [total.sectionKey, total.titleText])).toEqual([
      ['aiModels', 'Local AI models'],
      ['trash', 'Trash'],
    ]);
    expect(view.sections.map((section) => section.titleText)).toEqual(['Local AI models', 'Trash']);
  });

  test('titles the sections a running scan found so far, as the scan view does', () => {
    expect(
      buildScanProgressView({
        progress: {
          message: 'Measuring apps…',
          phase: 'apps',
          found: buildSectionTotals({
            candidates: [buildTestCandidate({ path: '/fixture/.Trash/old', category: 'trash' })],
            advice: [],
          }),
        },
        texts: TEXTS,
      }),
    ).toEqual({
      message: 'Measuring apps…',
      phase: 'apps',
      found: [
        {
          sectionKey: 'trash',
          allocatedBytes: 4096,
          isComplete: true,
          removableBytes: 4096,
          isRemovableComplete: true,
          itemCount: 1,
          safeBytes: 4096,
          adviceCount: 0,
          titleText: 'Trash',
        },
      ],
    });
  });

  testOnDarwin('shows Explore with advice only when the scan offered no Explore item', () => {
    const view = buildView({
      report: {
        ...EMPTY_REPORT,
        advice: [
          {
            ...buildAdvice({ path: `${HOME_DIR}/store`, title: 'Tool store', allocatedBytes: MB }),
            lastUsedAtMs: 1_725_148_800_000,
            appName: 'Tool\nApp',
          },
        ],
      },
    });

    expect(view.summary).toEqual({
      titleText: 'Nothing to delete was found.',
      lines: [],
      totalBytes: 0,
      isTotalComplete: true,
      safeBytes: 0,
      isSafeComplete: true,
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
            isComplete: true,
            displayPath: '~/store',
            revealPath: `${HOME_DIR}/store`,
            opener: null,
            lastUsedAt: 1_725_148_800_000,
            appName: 'Tool\\u{a}App',
            matchedBy: null,
          },
        ],
      },
    });
    expect(view.sectionTotals).toEqual([
      {
        sectionKey: 'developerTools',
        allocatedBytes: 0,
        isComplete: true,
        removableBytes: 0,
        isRemovableComplete: true,
        itemCount: 0,
        safeBytes: 0,
        adviceCount: 1,
        titleText: 'Developer tools',
      },
    ]);
  });

  testOnDarwin(
    'shows an engine item with nothing to reveal and the paths of a unit as deleted',
    () => {
      const engineCandidate = buildTestEngineCandidate({
        homeDir: HOME_DIR,
        allocatedBytes: 2 * MB,
      });
      const unitCandidate = buildTestVscodeExtensionCandidate({ home: HOME });
      const view = buildView({
        report: buildRankedReport({ candidates: [engineCandidate, unitCandidate] }),
      });

      expect(view.explore?.items).toEqual([
        expect.objectContaining({
          key: `explore:dockerDesktopEngine:engineBuildCache:dockerDesktopEngine:${HOME_DIR}/.docker/run/docker.sock`,
          removal: 'engine',
          displayPath: '~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
          revealPath: null,
        }),
        expect.objectContaining({ removal: 'delete', revealPath: unitCandidate.path }),
      ]);
    },
  );

  test('gives an advice the app or the Settings pane that handles its place', () => {
    const photosAdvice: Advice = {
      ...buildAdvice({
        path: `${HOME_DIR}/Pictures/Photos Library.photoslibrary`,
        title: 'Photos',
        allocatedBytes: MB,
      }),
      opener: { kind: 'app', app: 'photos' },
    };
    const view = buildView({ report: { ...EMPTY_REPORT, advice: [photosAdvice] } });

    expect(view.explore?.adviceGroup?.items[0]?.opener).toEqual({ kind: 'app', app: 'photos' });
  });

  test('names a container engine that did not answer as asked by the request it sent', () => {
    const socketPath = `${HOME_DIR}/.docker/run/docker.sock`;
    const view = buildView({
      report: {
        ...EMPTY_REPORT,
        issues: [
          {
            path: socketPath,
            reason: 'engineFailed',
            failure: { kind: 'requestFailed', endpoint: '/system/df', status: 500, code: null },
          },
          {
            path: socketPath,
            reason: 'engineFailed',
            failure: {
              kind: 'requestFailed',
              endpoint: '/_ping',
              status: null,
              code: 'ECONNRESET',
            },
          },
          {
            path: socketPath,
            reason: 'engineFailed',
            failure: { kind: 'badAnswer', endpoint: '/version' },
          },
        ],
      },
    });

    expect(view.notices).toEqual([
      {
        titleText: 'Could not ask 3 tools',
        lines: [
          `${socketPath}: the container engine did not answer as asked (/system/df answered 500)`,
          `${socketPath}: the container engine did not answer as asked (/_ping got no answer: ECONNRESET)`,
          `${socketPath}: the container engine did not answer as asked (/version gave an answer that could not be read)`,
        ],
        settingsLink: null,
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
      isTotalComplete: false,
      safeBytes: 2 * MB,
      isSafeComplete: false,
    });
    expect(view.sections[0]?.sizeText).toBe('at least 2.0 MB');
    expect(view.sections[0]?.items.map((item) => [item.sizeText, item.isComplete])).toEqual([
      ['at least 1.0 MB', false],
      ['1.0 MB', true],
    ]);
  });

  test('marks each total of the summary a lower bound only by the items it counts', () => {
    const view = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({ path: '/fixture/safe', risk: 'safe', allocatedBytes: MB }),
          buildTestCandidate({
            path: '/fixture/review',
            risk: 'review',
            allocatedBytes: MB,
            isComplete: false,
          }),
          buildTestCandidate({
            path: '/Applications/Kept.app',
            category: 'applications',
            risk: 'never',
            allocatedBytes: MB,
            isComplete: false,
          }),
        ],
      }),
    });
    const withoutReview = buildView({
      report: buildRankedReport({
        candidates: [
          buildTestCandidate({ path: '/fixture/safe', risk: 'safe', allocatedBytes: MB }),
          buildTestCandidate({
            path: '/Applications/Kept.app',
            category: 'applications',
            risk: 'never',
            allocatedBytes: MB,
            isComplete: false,
          }),
        ],
      }),
    });

    expect(view.summary).toMatchObject({
      totalBytes: 2 * MB,
      isTotalComplete: false,
      safeBytes: MB,
      isSafeComplete: true,
    });
    expect(withoutReview.summary).toMatchObject({
      totalBytes: MB,
      isTotalComplete: true,
      safeBytes: MB,
      isSafeComplete: true,
    });
  });

  test('numbers ascend top to bottom across the sections and Explore', () => {
    const report = buildRankedReport({
      candidates: [
        buildTestToolCandidate({
          home: buildExampleHome({ text: '/fixture' }),
          version: '20.1.0',
          allocatedBytes: 9 * MB,
        }),
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

  testOnDarwin('writes out control characters in every text that comes from outside', () => {
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
