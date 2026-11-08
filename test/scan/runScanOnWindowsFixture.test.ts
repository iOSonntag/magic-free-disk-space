import { afterAll, beforeAll, expect, test } from 'bun:test';
import { sep } from 'node:path';
import type { ConsumerSection } from '../../src/scan/placeCandidate.js';
import { placeCandidate } from '../../src/scan/placeCandidate.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { buildTestRecycleBinCandidate } from '../support/platformFixtures.js';
import { runTestScanOnPlatform } from '../support/scanRunFixtures.js';
import type { WindowsFixtureHome, WindowsFixturePlatform } from '../support/windowsFixtureHome.js';
import {
  buildWindowsFixturePlatform,
  buildWindowsFixtureScanView,
  createWindowsFixtureHome,
  windowsFixtureAdvisedApps,
  windowsFixtureRecycleBinContent,
} from '../support/windowsFixtureHome.js';
import { describeOnWindows } from '../support/windowsOnly.js';

// The fixture writes a file over the large-file limit, which a busy runner takes a while for.
const FIXTURE_SCAN_TIMEOUT_MS = 60_000;

describeOnWindows('a scan of a Windows fixture home over the Windows catalog', () => {
  let fixtureRoot: FixtureRoot;
  let home: WindowsFixtureHome;
  let fixturePlatform: WindowsFixturePlatform;
  let report: ScanReport;

  beforeAll(async () => {
    fixtureRoot = await createFixtureRoot();
    home = await createWindowsFixtureHome({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
    fixturePlatform = buildWindowsFixturePlatform({ environment: home.environment });
    report = await runTestScanOnPlatform({
      environment: home.environment,
      platform: fixturePlatform.platform,
    });
  }, FIXTURE_SCAN_TIMEOUT_MS);

  afterAll(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('scans every catalog entry, since each lies in the fixture home or temp folder', () => {
    expect(fixturePlatform.leftOutEntryIds).toEqual([]);
  });

  test('reads every place of the fixture without an issue', () => {
    expect(report.issues).toEqual([]);
    expect(report.cloudOnlyEntries).toEqual({ cloudStoreName: 'OneDrive', count: 0 });
  });

  test('lists items in exactly the sections the fixture fills', () => {
    const sections = new Set(
      report.candidates.map((candidate) => placeCandidate(candidate).section),
    );

    expect([...sections].toSorted()).toEqual([
      'caches',
      'developerTools',
      'largeFiles',
      'projects',
      'trash',
    ]);
  });

  test('lists the stale files of the temp folder as temporary files, and holds back a fresh one', () => {
    const temporaryPaths = report.candidates
      .filter((candidate) => candidate.category === 'temporary')
      .map((candidate) => candidate.path)
      .toSorted();

    expect(temporaryPaths).toEqual(
      [home.paths.staleTempFilePath, home.paths.staleTempFolderPath].toSorted(),
    );
    expect(report.skipped).toContainEqual({
      path: home.paths.freshTempFilePath,
      reason: 'recentActivity',
    });
  });

  test('lists the app caches of Chrome, Edge and classic Teams and the temporary files under Caches', () => {
    expect(listSectionPaths({ report: report, section: 'caches' })).toEqual(
      [
        home.paths.chromeCachePath,
        home.paths.edgeCachePath,
        home.paths.teamsClassicLogsPath,
        home.paths.staleTempFilePath,
        home.paths.staleTempFolderPath,
      ].toSorted(),
    );
  });

  test('lists the cache of npm, without the logs beside it, under Developer tools', () => {
    expect(listSectionPaths({ report: report, section: 'developerTools' })).toEqual([
      home.paths.npmCachePath,
    ]);
  });

  test('holds back the cache of new Teams while ms-teams.exe runs', () => {
    expect(report.skipped).toContainEqual({
      path: home.paths.teamsCacheChildPath,
      reason: 'ownerRunning',
    });
  });

  test('offers the logs of classic Teams beside its uploaded backgrounds, and holds back the backgrounds as sensitive', () => {
    expect(report.candidates.map((candidate) => candidate.path)).toContain(
      home.paths.teamsClassicLogsPath,
    );
    expect(
      report.candidates.filter((candidate) => candidate.path.split(sep).includes('Backgrounds')),
    ).toEqual([]);
    expect(report.skipped).toContainEqual({
      path: home.paths.teamsClassicBackgroundsPath,
      reason: 'protectedPath',
    });
  });

  test('lists bin and obj beside a .csproj in any case, and node_modules beside a package.json, under Projects', () => {
    expect(listSectionPaths({ report: report, section: 'projects' })).toEqual(
      [home.paths.dotnetBinPath, home.paths.dotnetObjPath, home.paths.nodeModulesPath].toSorted(),
    );
  });

  test('lists an obsolete VS Code extension, a pnpm store no pnpm uses, an Android system image no device uses, and an Android platform no project pins under Explore', () => {
    expect(listExplorePaths({ report: report })).toEqual(
      [
        home.paths.vscodeExtensionPath,
        home.paths.pnpmStorePath,
        home.paths.androidSystemImagePath,
        home.paths.androidPlatformPath,
      ].toSorted(),
    );
  });

  test('lists a file over the large-file limit in the Downloads known folder under Large files', () => {
    expect(listSectionPaths({ report: report, section: 'largeFiles' })).toEqual([
      home.paths.largeFilePath,
    ]);
  });

  test('lists the Recycle Bin of each fixed drive under Recycle Bin', () => {
    expect(
      report.candidates.filter((candidate) => placeCandidate(candidate).section === 'trash'),
    ).toEqual(
      home.environment.fixedDriveRoots.map((driveRoot) =>
        buildTestRecycleBinCandidate({
          driveRootText: driveRoot,
          scannedContent: windowsFixtureRecycleBinContent,
        }),
      ),
    );
  });

  test('advises uninstalling each installed app in Settings > Apps, and offers none for deletion', () => {
    const view = buildWindowsFixtureScanView({
      report: report,
      environment: home.environment,
      platform: fixturePlatform.platform,
    });

    expect(report.appAdvice).toEqual({
      apps: windowsFixtureAdvisedApps,
      installedAppsPageName: 'Settings > Apps',
    });
    expect(view.appAdvice?.introText).toBe(
      'Uninstall the apps you no longer use in Settings > Apps; this tool never deletes an app.',
    );
    expect(view.appAdvice?.items.map((item) => item.detailLines.map((line) => line.text))).toEqual([
      [
        'C:\\Program Files\\Contoso Studio',
        'Installed on this PC, as Settings > Apps lists it.',
        'Uninstall it in Settings > Apps if you no longer use it.',
      ],
      [
        'Installed on this PC, as Settings > Apps lists it.',
        'Uninstall it in Settings > Apps if you no longer use it.',
      ],
    ]);
    expect(view.appAdvice?.items.map((item) => Object.hasOwn(item, 'number'))).toEqual([
      false,
      false,
    ]);
    expect(
      report.candidates.filter((candidate) => candidate.origin.kind === 'application'),
    ).toEqual([]);
  });
});

/** The paths of the items listed in `section` itself, without the Explore items of its categories. */
function listSectionPaths(params: { report: ScanReport; section: ConsumerSection }): string[] {
  return params.report.candidates
    .filter((candidate) => {
      const place = placeCandidate(candidate);

      return place.kind === 'section' && place.section === params.section;
    })
    .map((candidate) => candidate.path)
    .toSorted();
}

function listExplorePaths(params: { report: ScanReport }): string[] {
  return params.report.candidates
    .filter((candidate) => placeCandidate(candidate).kind === 'explore')
    .map((candidate) => candidate.path)
    .toSorted();
}
