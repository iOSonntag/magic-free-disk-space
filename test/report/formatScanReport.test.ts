import { describe, expect, test } from 'bun:test';
import type { Risk } from '../../src/catalog/catalog.js';
import { formatCandidateView, formatScanReport } from '../../src/report/formatScanReport.js';
import type { Advice, Candidate } from '../../src/scan/candidate.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import {
  buildTestDartToolCandidate,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';

const fullDiskAccessLine =
  'Give your terminal Full Disk Access in System Settings > Privacy & Security to scan protected folders.';

const EXPLORE_HEADING =
  'Explore: their own tools remove these, or this tool deletes the folder shown where a tool has no command for it. "safe" never selects them; read the reasons first:';

function buildCandidate(params: {
  title: string;
  path: string;
  risk: Risk;
  allocatedBytes: number;
  isComplete: boolean;
}): Candidate {
  return {
    path: params.path,
    title: params.title,
    category: 'caches',
    risk: params.risk,
    origin: 'catalog',
    explanation: 'Cached files.',
    regeneration: 'Rebuilt when needed.',
    allocatedBytes: params.allocatedBytes,
    entryCount: 1,
    isComplete: params.isComplete,
    removal: {
      kind: 'deletePath',
      identity: { dev: 1n, ino: 1n, birthtimeNs: 1n, kind: 'directory', realPath: params.path },
      ownerBundlePaths: [],
    },
  };
}

function buildAdvice(params: {
  title: string;
  path: string;
  allocatedBytes: number;
  isComplete: boolean;
}): Advice {
  return {
    path: params.path,
    title: params.title,
    category: 'system',
    risk: 'careful',
    explanation: 'Installed simulator runtimes.',
    advice: 'Remove the runtimes you no longer need with xcrun simctl runtime delete.',
    allocatedBytes: params.allocatedBytes,
    isComplete: params.isComplete,
  };
}

describe('formatScanReport', () => {
  test('says that nothing was found for an empty report', () => {
    const lines = formatScanReport({
      report: { candidates: [], safeNumbers: [], advice: [], skipped: [], issues: [] },
    });

    expect(lines).toEqual(['Nothing to delete was found.']);
  });

  test('lists candidates in the given order with size, risk, title, path, and explanation', () => {
    const lines = formatScanReport({
      report: {
        candidates: [
          buildCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            allocatedBytes: 1024,
            isComplete: true,
          }),
          buildCandidate({
            title: 'Archives',
            path: '/fixture/b',
            risk: 'careful',
            allocatedBytes: 2048,
            isComplete: true,
          }),
        ],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines).toEqual([
      'Found 2 items, 3.0 KiB in total:',
      '1. 1.0 KiB [safe] Derived data',
      '   /fixture/a',
      '   Cached files. Rebuilt when needed.',
      '2. 2.0 KiB [careful] Archives',
      '   /fixture/b',
      '   Cached files. Rebuilt when needed.',
    ]);
  });

  test('marks an incomplete candidate size as at least', () => {
    const lines = formatScanReport({
      report: {
        candidates: [
          buildCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            allocatedBytes: 1024,
            isComplete: false,
          }),
        ],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines[1]).toBe('1. at least 1.0 KiB [safe] Derived data');
  });

  test('shows advice under a heading after a blank line', () => {
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [
          buildAdvice({
            title: 'Simulator runtimes',
            path: '/fixture/runtimes',
            allocatedBytes: 3 * 1024 ** 3,
            isComplete: true,
          }),
        ],
        skipped: [],
        issues: [],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Handle these yourself; this tool never deletes them:',
      '- 3.0 GiB [careful] Simulator runtimes',
      '   /fixture/runtimes',
      '   Remove the runtimes you no longer need with xcrun simctl runtime delete.',
    ]);
  });

  test('counts skipped items and names each reason that occurs', () => {
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
        skipped: [
          { path: '/fixture/a', reason: 'ownerRunning' },
          { path: '/fixture/b', reason: 'belowSizeThreshold' },
          { path: '/fixture/c', reason: 'belowSizeThreshold' },
        ],
        issues: [],
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
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
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
        issues: [],
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
    const lines = formatScanReport({
      report: {
        candidates: [
          buildCandidate({
            title: 'movie.mov\n2. 1.0 KiB [safe] Xcode build data',
            path: '/fixture/Downloads/movie.mov\n2. 1.0 KiB [safe] Xcode build data',
            risk: 'careful',
            allocatedBytes: 1024,
            isComplete: true,
          }),
        ],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines.slice(1, 3)).toEqual([
      '1. 1.0 KiB [careful] movie.mov\\u{a}2. 1.0 KiB [safe] Xcode build data',
      '   /fixture/Downloads/movie.mov\\u{a}2. 1.0 KiB [safe] Xcode build data',
    ]);
    expect(lines.join('\n').split('\n')).toHaveLength(lines.length);
  });

  test('lists every issue with its reason and detail', () => {
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
        skipped: [],
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
      fullDiskAccessLine,
    ]);
  });

  test('lists the tools it could not ask apart from the places it could not read', () => {
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
        skipped: [],
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
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
        skipped: [],
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

  test('lists the Explore items last under their heading, with evidence and command', () => {
    const toolCandidate = buildTestToolCandidate({
      homeDir: '/fixture/home',
      version: '20.1.0',
      allocatedBytes: 2048,
    });
    const lines = formatScanReport({
      report: {
        candidates: [
          buildCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            allocatedBytes: 1024,
            isComplete: true,
          }),
          toolCandidate,
        ],
        safeNumbers: [1],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines).toEqual([
      'Found 2 items, 3.0 KiB in total:',
      '1. 1.0 KiB [safe] Derived data',
      '   /fixture/a',
      '   Cached files. Rebuilt when needed.',
      '',
      EXPLORE_HEADING,
      '2. 2.0 KiB [safe] node 20.1.0',
      '   /fixture/home/.local/share/mise/installs/node/20.1.0',
      `   ${toolCandidate.explanation} ${toolCandidate.regeneration}`,
      '   - mise prune would remove node@20.1.0',
      '   Runs: mise uninstall node@20.1.0',
    ]);
  });

  test('shows the command of a tool item with the leading arguments of its tool', () => {
    const lines = formatScanReport({
      report: {
        candidates: [buildTestDartToolCandidate({ homeDir: '/fixture/home' })],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines).toContain('   Runs: dart --suppress-analytics pub cache gc --force');
  });

  test('lists a unit folder as an Explore item with its evidence and no command', () => {
    const lines = formatScanReport({
      report: {
        candidates: [buildTestVscodeExtensionCandidate({ homeDir: '/Users/example' })],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [],
      },
    });

    expect(lines).toEqual([
      'Found 1 item, 4.0 KiB in total:',
      '',
      EXPLORE_HEADING,
      '1. 4.0 KiB [review] VS Code extension example.alpha 1.0.0',
      '   /Users/example/.vscode/extensions/example.alpha-1.0.0',
      '   An extension folder VS Code marked for removal after an uninstall or an update. VS Code downloads it again only if you install this version again.',
      "   - Neither VS Code's default registry nor any profile's lists this folder.",
      "   - VS Code's .obsolete file marks it for removal.",
    ]);
  });

  test('omits the Full Disk Access line when no issue is a permission problem', () => {
    const lines = formatScanReport({
      report: {
        candidates: [],
        safeNumbers: [],
        advice: [],
        skipped: [],
        issues: [{ path: '/fixture/broken', reason: 'unexpected', detail: 'EIO' }],
      },
    });

    expect(lines).toEqual([
      'Nothing to delete was found.',
      '',
      'Could not read 1 place:',
      '- /fixture/broken: unexpected error (EIO)',
    ]);
  });

  test('shows the candidates, advice, skipped items, and issues in that order', () => {
    const lines = formatScanReport({
      report: {
        candidates: [
          buildCandidate({
            title: 'Derived data',
            path: '/fixture/a',
            risk: 'safe',
            allocatedBytes: 1024,
            isComplete: true,
          }),
        ],
        safeNumbers: [],
        advice: [
          buildAdvice({
            title: 'Simulator runtimes',
            path: '/fixture/runtimes',
            allocatedBytes: 3 * 1024 ** 3,
            isComplete: true,
          }),
        ],
        skipped: [{ path: '/fixture/b', reason: 'ownerRunning' }],
        issues: [{ path: '/fixture/c', reason: 'unexpected', detail: 'EIO' }],
      },
    });

    expect(lines).toEqual([
      'Found 1 item, 1.0 KiB in total:',
      '1. 1.0 KiB [safe] Derived data',
      '   /fixture/a',
      '   Cached files. Rebuilt when needed.',
      '',
      'Handle these yourself; this tool never deletes them:',
      '- 3.0 GiB [careful] Simulator runtimes',
      '   /fixture/runtimes',
      '   Remove the runtimes you no longer need with xcrun simctl runtime delete.',
      '',
      'Skipped 1 item:',
      '- its app or tool is running: 1',
      '',
      'Could not read 1 place:',
      '- /fixture/c: unexpected error (EIO)',
    ]);
  });
});

describe('formatCandidateView', () => {
  test('gives a unit folder its evidence and no command, as the app receives it', () => {
    expect(
      formatCandidateView({
        candidate: buildTestVscodeExtensionCandidate({ homeDir: '/Users/example' }),
        number: 3,
      }),
    ).toEqual({
      number: 3,
      title: 'VS Code extension example.alpha 1.0.0',
      path: '/Users/example/.vscode/extensions/example.alpha-1.0.0',
      risk: 'review',
      explanation:
        'An extension folder VS Code marked for removal after an uninstall or an update.',
      regeneration: 'VS Code downloads it again only if you install this version again.',
      sizeText: '4.0 KiB',
      evidenceLines: [
        "Neither VS Code's default registry nor any profile's lists this folder.",
        "VS Code's .obsolete file marks it for removal.",
      ],
      commandText: null,
    });
  });
});
