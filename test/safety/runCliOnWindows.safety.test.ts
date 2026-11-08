import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { runCli } from '../../src/cli/runCli.js';
import type { JournalEntry } from '../../src/delete/deletionJournal.js';
import { isSamePath } from '../../src/path/isSameOrInsidePath.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  listFixturePathsBesideLog,
} from '../support/fixtureRoot.js';
import { PROTOCOL_FIXTURE_DISK } from '../support/protocolFixtureScan.js';
import { createScriptedTerminalIo } from '../support/scriptedTerminalIo.js';
import type { WindowsFixtureHome } from '../support/windowsFixtureHome.js';
import {
  buildWindowsFixturePlatform,
  createWindowsFixtureHome,
  runWindowsFixtureScan,
} from '../support/windowsFixtureHome.js';

// The fixture writes a file over the large-file limit, and the run scans twice and deletes.
const CLI_RUN_TIMEOUT_MS = 60_000;

describe.skipIf(process.platform !== 'win32')(
  'the deletion of approved items of a Windows fixture home through the command line',
  () => {
    let fixtureRoot: FixtureRoot;
    let home: WindowsFixtureHome;

    beforeEach(async () => {
      fixtureRoot = await createFixtureRoot();
      home = await createWindowsFixtureHome({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
    }, CLI_RUN_TIMEOUT_MS);

    afterEach(async () => {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    });

    test(
      'deletes exactly the approved items, empties the approved bins through the fake, and logs each',
      async () => {
        const fixturePlatform = buildWindowsFixturePlatform({ environment: home.environment });
        const platform = fixturePlatform.platform;
        const approvedFixturePaths = [
          home.paths.staleTempFilePath,
          home.paths.npmCachePath,
          home.paths.chromeCachePath,
          home.paths.dotnetBinPath,
        ];
        const approvedBinPaths = home.environment.fixedDriveRoots.map((driveRoot) =>
          join(driveRoot, '$Recycle.Bin'),
        );
        const approvedPaths = [...approvedFixturePaths, ...approvedBinPaths];
        const scannedReport = await runWindowsFixtureScan({
          environment: home.environment,
          platform: platform,
        });
        const approvedNumbers = approvedPaths.map((path) =>
          findCandidateNumber({ report: scannedReport, path: path }),
        );
        const approvedPathsBelowRoot = approvedFixturePaths.map((path) =>
          buildPathBelowFixtureRoot({ fixtureRoot: fixtureRoot, path: path }),
        );
        const before = await listFixturePaths();
        const io = createScriptedTerminalIo({
          isTerminal: true,
          inputLines: [approvedNumbers.join(', '), 'DELETE'],
        });

        const exitCode = await runCli({
          argv: [],
          environment: home.environment,
          catalog: platform.catalog,
          tools: platform.tools,
          scan: platform.scan,
          // A fixed disk, so no test reads the volume it runs on.
          system: { ...platform.system, loadVolumeSpace: async () => PROTOCOL_FIXTURE_DISK },
          delete: platform.delete,
          explore: platform.explore,
          texts: platform.report,
          io: io,
        });

        const after = await listFixturePaths();
        const logEntries = await loadDeletionLogEntries({
          logPath: home.environment.deletionLogPath,
        });

        expect(exitCode).toBe(0);
        expect(io.outText()).toContain(
          'Uninstall the apps you no longer use in Settings > Apps; this tool never deletes an app.',
        );
        expect(io.outText()).toContain(
          `These ${approvedPaths.length} items will be deleted permanently`,
        );
        expect(io.prompts[1]).toContain(
          'This cannot be undone: the items do not go to the Recycle Bin.',
        );
        expect(approvedPathsBelowRoot.filter((path) => !before.includes(path))).toEqual([]);
        expect(before.filter((path) => !after.includes(path))).toEqual(
          before.filter((path) =>
            approvedPathsBelowRoot.some(
              (approvedPath) => path === approvedPath || path.startsWith(`${approvedPath}/`),
            ),
          ),
        );
        expect(after.filter((path) => !before.includes(path))).toEqual([]);
        expect(fixturePlatform.emptiedDriveRoots).toEqual(home.environment.fixedDriveRoots);
        expect(
          logEntries.flatMap((entry) => (entry.kind === 'intent' ? [entry.path] : [])).toSorted(),
        ).toEqual(approvedPaths.toSorted());
        expect(
          logEntries
            .flatMap((entry) =>
              entry.kind === 'outcome' ? [`${entry.outcome} ${entry.path}`] : [],
            )
            .toSorted(),
        ).toEqual(approvedPaths.map((path) => `removed ${path}`).toSorted());
      },
      CLI_RUN_TIMEOUT_MS,
    );

    function listFixturePaths(): Promise<string[]> {
      return listFixturePathsBesideLog({
        fixtureRoot: fixtureRoot,
        deletionLogPath: home.environment.deletionLogPath,
      });
    }
  },
);

/** The number the command line shows for the item at `path`, which a scan of the same fixture ranks alike. */
function findCandidateNumber(params: { report: ScanReport; path: string }): number {
  const index = params.report.candidates.findIndex((candidate) =>
    isSamePath({ rules: WIN32_PATH_RULES, path: candidate.path, otherPath: params.path }),
  );

  if (index === -1) {
    throw new Error(`The scan offers no item at ${params.path}.`);
  }

  return index + 1;
}

function buildPathBelowFixtureRoot(params: { fixtureRoot: FixtureRoot; path: string }): string {
  return relative(params.fixtureRoot.rootDir, params.path).split(sep).join('/');
}

async function loadDeletionLogEntries(params: { logPath: string }): Promise<JournalEntry[]> {
  const text = await readFile(params.logPath, 'utf8');

  return text
    .trim()
    .split('\n')
    .map((line) => parseJournalLine(line));
}

function parseJournalLine(line: string): JournalEntry {
  // The journal writes each entry as one line of JSON, which `JSON.parse` reads back untyped.
  return JSON.parse(line) as JournalEntry;
}
