import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { isSamePath } from '../../src/path/isSameOrInsidePath.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { ScanView } from '../../src/report/buildScanView.js';
import { runTestCli } from '../support/cliRunFixtures.js';
import { loadTestJournalLines } from '../support/deletionJournalFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  buildPathBelowRoot,
  createFixtureRoot,
  deleteFixtureRoot,
  isSameOrBelowPathBelowRoot,
  listFixturePathsBesideLog,
} from '../support/fixtureRoot.js';
import { listNumberedViewItems } from '../support/numberedViewItems.js';
import { getWin32RecycleBinScanTrash } from '../support/platformFixtures.js';
import { runTestScanOnPlatform } from '../support/scanRunFixtures.js';
import { createScriptedTerminalIo } from '../support/scriptedTerminalIo.js';
import type { WindowsFixtureHome } from '../support/windowsFixtureHome.js';
import {
  buildWindowsFixturePlatform,
  buildWindowsFixtureScanView,
  createWindowsFixtureHome,
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
          home.paths.vscodeExtensionPath,
        ];
        const approvedBinPaths = home.environment.fixedDriveRoots.map((driveRoot) =>
          join(driveRoot, getWin32RecycleBinScanTrash().binFolderName),
        );
        const approvedPaths = [...approvedFixturePaths, ...approvedBinPaths];
        const scannedView = buildWindowsFixtureScanView({
          report: await runTestScanOnPlatform({
            environment: home.environment,
            platform: platform,
          }),
          environment: home.environment,
          platform: platform,
        });
        const approvedNumbers = approvedPaths.map((path) =>
          findItemNumber({ view: scannedView, path: path }),
        );
        const approvedPathsBelowRoot = approvedFixturePaths.map((path) =>
          buildPathBelowRoot({ rootDir: fixtureRoot.rootDir, path: path }),
        );
        const before = await listFixturePaths();
        const io = createScriptedTerminalIo({
          isTerminal: true,
          inputLines: [approvedNumbers.join(', '), 'DELETE'],
        });

        const exitCode = await runTestCli({
          argv: [],
          environment: home.environment,
          platform: platform,
          io: io,
        });

        const after = await listFixturePaths();
        const logLines = await loadTestJournalLines({ logPath: home.environment.deletionLogPath });
        const intentLines = filterLogLinesOfKind({ lines: logLines, kind: 'intent' });
        const outcomeLines = filterLogLinesOfKind({ lines: logLines, kind: 'outcome' });

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
            approvedPathsBelowRoot.some((approvedPath) =>
              isSameOrBelowPathBelowRoot({ path: path, parentPath: approvedPath }),
            ),
          ),
        );
        expect(after.filter((path) => !before.includes(path))).toEqual([]);
        expect(fixturePlatform.emptiedDriveRoots).toEqual(home.environment.fixedDriveRoots);
        expect(intentLines.map((line) => line.path).toSorted()).toEqual(approvedPaths.toSorted());
        expect(outcomeLines.map((line) => line.path).toSorted()).toEqual(approvedPaths.toSorted());
        expect(outcomeLines.map((line) => line.outcome)).toEqual(
          approvedPaths.map(() => 'removed'),
        );
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

/** The number the command line shows for the item at `path`, as the view of its scan numbers it. */
function findItemNumber(params: { view: ScanView; path: string }): number {
  const item = listNumberedViewItems({ view: params.view }).find(
    (candidate) =>
      candidate.revealPath !== null &&
      isSamePath({ rules: WIN32_PATH_RULES, path: candidate.revealPath, otherPath: params.path }),
  );

  if (item === undefined) {
    throw new Error(`The scan shows no item at ${params.path}.`);
  }

  return item.number;
}

/** The lines of the log that are records of `kind`, their fields still unchecked. */
function filterLogLinesOfKind(params: {
  lines: unknown[];
  kind: string;
}): Record<string, unknown>[] {
  return params.lines.filter(
    (line): line is Record<string, unknown> =>
      typeof line === 'object' && line !== null && 'kind' in line && line.kind === params.kind,
  );
}
