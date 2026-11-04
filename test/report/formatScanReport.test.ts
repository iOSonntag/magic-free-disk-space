import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { WIN32_REPORT_TEXTS } from '../../src/platform/win32/reportTexts.js';
import { formatScanReport } from '../../src/report/formatScanReport.js';
import type { Advice } from '../../src/scan/candidate.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import {
  buildTestAdvice,
  buildTestCandidate,
  buildTestDartToolCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import { buildExampleHome } from '../support/parsedValueFixtures.js';
import { EMPTY_REPORT } from '../support/scanReportFixtures.js';

const TEXTS = darwinPlatform.report;

const FIXTURE_HOME = buildExampleHome({ text: '/fixture/home' });

const fullDiskAccessLine =
  '- Give your terminal Full Disk Access in System Settings > Privacy & Security to scan protected folders.';

const EXPLORE_INTRO =
  'Their own tools remove these, or the folder shown is deleted where a tool has no command for it. They are never selected for you; read the reasons first.';

function buildAdvice(params: {
  title: string;
  path: string;
  allocatedBytes: number;
  isComplete: boolean;
}): Advice {
  return buildTestAdvice({
    origin: { kind: 'catalog', entryId: 'simulator-runtimes' },
    path: params.path,
    title: params.title,
    category: 'system',
    risk: 'careful',
    explanation: 'Installed simulator runtimes.',
    advice: 'Remove the runtimes you no longer need with xcrun simctl runtime delete.',
    allocatedBytes: params.allocatedBytes,
    isComplete: params.isComplete,
  });
}

/** The lines the CLI prints for `report`, with no disk read, as when its volume cannot be read. */
function formatReport(params: { report: ScanReport }): string[] {
  return formatScanReport({
    report: params.report,
    texts: TEXTS,
    homeDir: '/fixture/home',
    disk: null,
  });
}

describe('formatScanReport', () => {
  test('says that nothing was found for an empty report', () => {
    expect(formatReport({ report: EMPTY_REPORT })).toEqual(['Nothing to delete was found.']);
  });

  test('prints the summary, then each section with its numbered items and its check group', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [
          buildTestCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 1024,
            isComplete: true,
          }),
          buildTestCandidate({
            title: 'Archives',
            path: '/fixture/b',
            risk: 'careful',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 2048,
            isComplete: true,
          }),
          buildTestCandidate({
            title: 'Old video',
            path: '/fixture/movie.mov',
            risk: 'careful',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 4096,
            isComplete: true,
            category: 'userFiles',
          }),
        ],
        safeNumbers: [1],
      },
    });

    expect(lines).toEqual([
      'Found 3 items, 7.2 KB in total:',
      '- 1.0 KB safe to free',
      '- 6.1 KB to check before deleting',
      '',
      'Caches (3.1 KB):',
      '1. 1.0 KB [safe] Derived data',
      '   /fixture/a',
      '   Cached files.',
      '   Rebuilt when needed.',
      'Check before deleting:',
      '2. 2.0 KB [careful] Archives',
      '   /fixture/b',
      '   Cached files.',
      '   Rebuilt when needed.',
      '',
      'Large files (4.1 KB):',
      'Check before deleting:',
      '3. 4.1 KB [careful] Old video',
      '   /fixture/movie.mov',
      '   Cached files.',
      '   Rebuilt when needed.',
    ]);
  });

  test('marks an incomplete size as at least, in the item, its section, and the summary', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [
          buildTestCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 1024,
            isComplete: false,
          }),
        ],
        safeNumbers: [1],
      },
    });

    expect(lines.slice(0, 5)).toEqual([
      'Found 1 item, at least 1.0 KB in total:',
      '- at least 1.0 KB safe to free',
      '',
      'Caches (at least 1.0 KB):',
      '1. at least 1.0 KB [safe] Derived data',
    ]);
  });

  test('shows advice unnumbered under Explore, after its intro', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        advice: [
          buildAdvice({
            title: 'Simulator runtimes',
            path: '/fixture/runtimes',
            allocatedBytes: 3 * 1024 ** 3,
            isComplete: true,
          }),
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Explore:',
      EXPLORE_INTRO,
      'Handle these yourself; this tool never deletes them:',
      '- 3.2 GB [careful] Simulator runtimes',
      '   /fixture/runtimes',
      '   Installed simulator runtimes.',
      '   Remove the runtimes you no longer need with xcrun simctl runtime delete.',
    ]);
  });

  test('lists the installed apps of advice unnumbered after Explore, each with its size or none', () => {
    const lines = formatScanReport({
      texts: WIN32_REPORT_TEXTS,
      report: {
        ...EMPTY_REPORT,
        appAdvice: [
          {
            displayName: 'Example Editor',
            installFolderPath: 'C:\\Program Files\\Example Editor',
            estimatedBytes: 2 * 1024 ** 3,
          },
          { displayName: 'Example Tool', installFolderPath: null, estimatedBytes: null },
        ],
        skipped: [{ path: 'C:\\fixture\\a', reason: 'belowSizeThreshold' }],
      },
      homeDir: 'C:\\Users\\fixture',
      disk: null,
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Installed apps:',
      'Uninstall the apps you no longer use in Settings > Apps; this tool never deletes an app.',
      '- 2.1 GB [review] Example Editor',
      '   C:\\Program Files\\Example Editor',
      '   Installed on this PC, as Settings > Apps lists it.',
      '   Uninstall it in Settings > Apps if you no longer use it.',
      '- size unknown [review] Example Tool',
      '   Installed on this PC, as Settings > Apps lists it.',
      '   Uninstall it in Settings > Apps if you no longer use it.',
      '',
      'Skipped 1 item:',
      '- too small to matter: 1',
    ]);
  });

  test('counts skipped items and names each reason that occurs', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        skipped: [
          { path: '/fixture/a', reason: 'ownerRunning' },
          { path: '/fixture/b', reason: 'belowSizeThreshold' },
          { path: '/fixture/c', reason: 'belowSizeThreshold' },
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Skipped 3 items:',
      '- too small to matter: 2',
      '- its app or tool is running: 1',
    ]);
  });

  test('names every skip reason in table order, one line each', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        skipped: [
          { path: '/fixture/overlap', reason: 'overlapsEarlierCandidate' },
          { path: '/fixture/holdsOtherVolume', reason: 'holdsOtherVolume' },
          { path: '/fixture/installedAppsUnknown', reason: 'installedAppsUnknown' },
          { path: '/fixture/notBundleId', reason: 'notBundleId' },
          { path: '/fixture/ownerInstalled', reason: 'ownerInstalled' },
          { path: '/fixture/useUnknown', reason: 'useUnknown' },
          { path: '/fixture/recentUse', reason: 'recentUse' },
          { path: '/fixture/activityUnknown', reason: 'activityUnknown' },
          { path: '/fixture/recentActivity', reason: 'recentActivity' },
          { path: '/fixture/runningUnknown', reason: 'runningUnknown' },
          { path: '/fixture/ownerRunning', reason: 'ownerRunning' },
          { path: '/fixture/systemOwned', reason: 'systemOwned' },
          { path: '/fixture/symbolicLink', reason: 'symbolicLink' },
          { path: '/fixture/belowSizeThreshold', reason: 'belowSizeThreshold' },
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Skipped 14 items:',
      '- too small to matter: 1',
      '- symbolic link, never followed: 1',
      '- owned by macOS: 1',
      '- its app or tool is running: 1',
      '- could not check whether its app or tool runs: 1',
      '- changed recently: 1',
      '- could not tell when it last changed: 1',
      '- used recently: 1',
      '- could not tell when it was last used: 1',
      '- its app is installed: 1',
      '- no app identifier: 1',
      '- could not read every installed app: 1',
      '- holds another mounted disk: 1',
      '- already covered by another item: 1',
    ]);
  });

  test('writes out control characters in a title and a path, so no line can be forged', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [
          buildTestCandidate({
            title: 'movie.mov\n2. 1.0 KB [safe] Xcode build data',
            path: '/fixture/Downloads/movie.mov\n2. 1.0 KB [safe] Xcode build data',
            risk: 'careful',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 1024,
            isComplete: true,
          }),
        ],
      },
    });

    expect(lines.slice(5, 7)).toEqual([
      '1. 1.0 KB [careful] movie.mov\\u{a}2. 1.0 KB [safe] Xcode build data',
      '   /fixture/Downloads/movie.mov\\u{a}2. 1.0 KB [safe] Xcode build data',
    ]);
    expect(lines.join('\n').split('\n')).toHaveLength(lines.length);
  });

  test('lists every issue with its reason and detail, and names Full Disk Access for no denial by permissions', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        issues: [
          { path: '/fixture/locked', reason: 'permissionDenied', detail: 'EACCES' },
          { path: '/fixture/broken', reason: 'unexpected', detail: 'EIO' },
          { path: '/fixture/tool', reason: 'commandFailed', detail: 'timedOut' },
          { path: '/fixture/deep', reason: 'walkStopped', detail: 'deadline' },
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Could not read 4 places:',
      '- /fixture/locked: permission denied (EACCES)',
      '- /fixture/broken: unexpected error (EIO)',
      '- /fixture/tool: a system command failed (timedOut)',
      '- /fixture/deep: search stopped at its time limit (deadline)',
    ]);
  });

  test('names Full Disk Access for the terminal after a place macOS privacy protection blocked', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        issues: [
          { path: '/fixture/Mail', reason: 'privacyDenied', detail: 'EPERM' },
          { path: '/fixture/locked', reason: 'permissionDenied', detail: 'EACCES' },
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Could not read 2 places:',
      '- /fixture/Mail: blocked by macOS privacy protection (EPERM)',
      '- /fixture/locked: permission denied (EACCES)',
      fullDiskAccessLine,
    ]);
  });

  test('lists the tools it could not ask apart from the places it could not read', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        issues: [
          { path: '/fixture/locked', reason: 'unexpected', detail: 'EIO' },
          { path: '/fixture/bin/mise', reason: 'toolUntrusted', detail: 'writableByOthers' },
          {
            path: '/usr/bin/xcrun',
            reason: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: {
                reason: 'exitedWithError',
                exitCode: 1,
                stderrTail: '\n  xcrun: error: simctl broke\nsecond line\n',
              },
            },
          },
          {
            path: '/fixture/bin/dart',
            reason: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'timedOut', timeoutMs: 60_000, stderrTail: '' },
            },
          },
        ],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Could not read 1 place:',
      '- /fixture/locked: unexpected error (EIO)',
      '',
      'Could not ask 3 tools:',
      '- /fixture/bin/mise: the tool is not trusted, never run (others can change it)',
      '- /usr/bin/xcrun: the tool failed (exited with code 1: xcrun: error: simctl broke)',
      '- /fixture/bin/dart: the tool failed (stopped at its time limit of 60 s)',
    ]);
  });

  test('writes out control characters in the detail of an issue and in the stderr of a tool', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        issues: [
          { path: '/fixture/broken', reason: 'unexpected', detail: 'EIO\r- /fixture/forged' },
          {
            path: '/fixture/bin/mise',
            reason: 'toolFailed',
            failure: {
              reason: 'commandFailed',
              failure: { reason: 'endedBySignal', signal: 'SIGKILL', stderrTail: 'red\u001b[31m' },
            },
          },
        ],
      },
    });

    expect(lines).toContain('- /fixture/broken: unexpected error (EIO\\u{d}- /fixture/forged)');
    expect(lines).toContain(
      '- /fixture/bin/mise: the tool failed (ended by signal SIGKILL: red\\u{1b}[31m)',
    );
  });

  test('lists the Explore items last, numbered on, with their evidence and command', () => {
    const toolCandidate = buildTestToolCandidate({
      home: FIXTURE_HOME,
      version: '20.1.0',
      allocatedBytes: 2048,
    });
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [
          buildTestCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 1024,
            isComplete: true,
          }),
          toolCandidate,
        ],
        safeNumbers: [1],
      },
    });

    expect(lines).toEqual([
      'Found 2 items, 3.1 KB in total:',
      '- 1.0 KB safe to free',
      '- 2.0 KB in Explore',
      '',
      'Caches (1.0 KB):',
      '1. 1.0 KB [safe] Derived data',
      '   /fixture/a',
      '   Cached files.',
      '   Rebuilt when needed.',
      '',
      'Explore:',
      EXPLORE_INTRO,
      '2. 2.0 KB [safe] node 20.1.0',
      '   /fixture/home/.local/share/mise/installs/node/20.1.0',
      `   ${toolCandidate.explanation}`,
      `   ${toolCandidate.regeneration}`,
      '   - mise prune would remove node@20.1.0',
      '   Runs: mise uninstall node@20.1.0',
    ]);
  });

  test('shows the command of a tool item with the leading arguments of its tool', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [buildTestDartToolCandidate({ home: FIXTURE_HOME })],
      },
    });

    expect(lines).toContain('   Runs: dart --suppress-analytics pub cache gc --force');
  });

  test('lists a unit folder as an Explore item with its evidence and no command', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [
          buildTestVscodeExtensionCandidate({ home: buildExampleHome({ text: '/Users/example' }) }),
        ],
      },
    });

    expect(lines).toEqual([
      'Found 1 item, 4.1 KB in total:',
      '- 4.1 KB in Explore',
      '',
      'Explore:',
      EXPLORE_INTRO,
      '1. 4.1 KB [review] VS Code extension example.alpha 1.0.0',
      '   /Users/example/.vscode/extensions/example.alpha-1.0.0',
      '   An extension folder VS Code marked for removal after an uninstall or an update.',
      '   VS Code downloads it again only if you install this version again.',
      "   - Neither VS Code's default registry nor any profile's lists this folder.",
      "   - VS Code's .obsolete file marks it for removal.",
    ]);
  });

  test('shows the summary, the sections, Explore, the skipped items, and the notices in that order', () => {
    const lines = formatReport({
      report: {
        candidates: [
          buildTestCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            explanation: 'Cached files.',
            regeneration: 'Rebuilt when needed.',
            allocatedBytes: 1024,
            isComplete: true,
          }),
        ],
        safeNumbers: [1],
        advice: [
          buildAdvice({
            title: 'Simulator runtimes',
            path: '/fixture/runtimes',
            allocatedBytes: 3 * 1024 ** 3,
            isComplete: true,
          }),
        ],
        appAdvice: [],
        skipped: [{ path: '/fixture/b', reason: 'ownerRunning' }],
        evictedEntryCount: 2,
        issues: [
          { path: '/fixture/c', reason: 'unexpected', detail: 'EIO' },
          { path: '/fixture/bin/mise', reason: 'toolUntrusted', detail: 'foreignOwner' },
        ],
      },
    });

    expect(lines).toEqual([
      'Found 1 item, 1.0 KB in total:',
      '- 1.0 KB safe to free',
      '',
      'Caches (1.0 KB):',
      '1. 1.0 KB [safe] Derived data',
      '   /fixture/a',
      '   Cached files.',
      '   Rebuilt when needed.',
      '',
      'Explore:',
      EXPLORE_INTRO,
      'Handle these yourself; this tool never deletes them:',
      '- 3.2 GB [careful] Simulator runtimes',
      '   /fixture/runtimes',
      '   Installed simulator runtimes.',
      '   Remove the runtimes you no longer need with xcrun simctl runtime delete.',
      '',
      'Skipped 3 items:',
      '- its app or tool is running: 1',
      '- in iCloud, not on this Mac: 2',
      '',
      'Could not read 1 place:',
      '- /fixture/c: unexpected error (EIO)',
      '',
      'Could not ask 1 tool:',
      '- /fixture/bin/mise: the tool is not trusted, never run (owned by another user)',
    ]);
  });

  test('prints the notice of the sizes that count every block after the other notices', () => {
    const lines = formatReport({
      report: {
        ...EMPTY_REPORT,
        candidates: [buildTestCandidate({ path: '/fixture/a', privateSizeFallbackCount: 1 })],
        safeNumbers: [1],
      },
    });

    expect(lines.slice(-2)).toEqual([
      'Some sizes may be larger than the space they free:',
      '- macOS did not give the private size of 1 entry, so their full size counts, which may include space they share with a copy.',
    ]);
  });
});
