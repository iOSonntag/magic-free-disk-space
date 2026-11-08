import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildSectionTotals } from '../../src/scan/buildSectionTotals.js';
import type { Advice, CandidateDecision } from '../../src/scan/candidate.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ConsumerSection } from '../../src/scan/placeCandidate.js';
import type { ScanProgress, ScanReport } from '../../src/scan/runScan.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import type { AdvisedApp } from '../../src/scan/scanPlatform.js';
import { createAndroidAvdHome, writeAndroidSystemImage } from '../explore/androidFixtures.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import type { TestUnitPathsCandidateParams } from '../support/candidateFixtures.js';
import {
  buildTestAdvice,
  buildTestCandidate,
  buildTestIdeVersionCandidate,
  buildTestInstallersCandidate,
  buildTestUnitPathsCandidate,
} from '../support/candidateFixtures.js';
import { describeOnDarwin } from '../support/darwinOnly.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import {
  buildTestPathEnvironment,
  createFixtureFile,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildExampleHome, buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { withFixtureHome } from '../support/probeRunFixtures.js';
import { getCatalogEntry, runTestScan } from '../support/scanRunFixtures.js';

const HOME_DIR = '/Users/example';

/** The time of every scan of a fixture home, half a year after its files were written. */
const SCAN_NOW_MS = Date.UTC(2026, 6, 1);

const ENVIRONMENT = buildTestPathEnvironment({ homeDir: HOME_DIR, nowMs: Date.UTC(2026, 0, 1) });

const HUGGING_FACE_PATH = `${HOME_DIR}/.cache/huggingface`;

const HUGGING_FACE_HUB_PATH = `${HUGGING_FACE_PATH}/hub`;

const JETBRAINS_CACHES_PATH = `${HOME_DIR}/Library/Caches/JetBrains`;

const GOOGLE_CACHES_PATH = `${HOME_DIR}/Library/Caches/Google`;

const DOWNLOADS_PATH = `${HOME_DIR}/Downloads`;

const INSTALLER_PATH = `${DOWNLOADS_PATH}/Example-1.0.dmg`;

const MIB = 1024 * 1024;

const vscodeAdvice: Advice = buildTestAdvice({
  origin: { kind: 'catalog', entryId: 'vscode-extensions' },
  path: `${HOME_DIR}/.vscode/extensions`,
  title: 'VS Code extensions',
  category: 'developer',
  advice: 'Uninstall the extensions you no longer use in VS Code.',
  allocatedBytes: 65_536,
});

const vscodeCandidate = buildTestVscodeExtensionCandidate({
  home: buildExampleHome({ text: HOME_DIR }),
});

const vscodeOffer: CandidateDecision = { kind: 'offer', candidate: vscodeCandidate };

describe('buildScanReportOfPhases', () => {
  test('keeps the offers of an incomplete probe and shows the advice of its entry', () => {
    const report = buildScanReportOfPhases({
      environment: ENVIRONMENT,
      reservedEntryPaths: [vscodeAdvice.path],
      phases: [{ decisions: [vscodeOffer], issues: [] }],
      incompleteExploreAdvice: {
        decisions: [{ kind: 'advice', advice: vscodeAdvice }],
        issues: [{ path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' }],
      },
      appAdvice: null,
      evictedEntryCount: 2,
    });

    expect(report.candidates).toEqual([vscodeCandidate]);
    expect(report.advice).toEqual([vscodeAdvice]);
    expect(report.skipped).toEqual([]);
    expect(report.evictedEntryCount).toBe(2);
    expect(report.issues).toEqual([
      { path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' },
    ]);
  });

  test('would hold back those offers if the advice took part in the dedupe', () => {
    const report = buildScanReportOfPhases({
      environment: ENVIRONMENT,
      reservedEntryPaths: [vscodeAdvice.path],
      phases: [{ decisions: [vscodeOffer, { kind: 'advice', advice: vscodeAdvice }], issues: [] }],
      incompleteExploreAdvice: { decisions: [], issues: [] },
      appAdvice: null,
      evictedEntryCount: 0,
    });

    expect(report.candidates).toEqual([]);
    expect(report.skipped).toEqual([
      { path: vscodeCandidate.path, reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('shows the Hugging Face repositories while the catch-all child of the cache gives way', () => {
    const catchAllChild = buildCatalogOffer({ path: HUGGING_FACE_PATH, entryId: 'home-caches' });
    const repositoryPath = `${HUGGING_FACE_HUB_PATH}/models--example--model`;
    const repositoryOffer = buildUnitOffer({
      probe: 'huggingFaceRepos',
      unit: {
        kind: 'huggingFaceRepository',
        repoPath: buildTestAbsolutePath({ text: repositoryPath }),
        downloadedAtMs: null,
        foundPaths: [buildTestAbsolutePath({ text: repositoryPath })],
      },
      path: repositoryPath,
      targetPaths: [repositoryPath],
    });

    const report = buildReportOfPhases({
      reservedEntryPaths: [HUGGING_FACE_HUB_PATH],
      phases: [[catchAllChild], [repositoryOffer]],
    });

    expect(listOfferedPaths(report)).toEqual([repositoryPath]);
    expect(report.skipped).toEqual([{ path: HUGGING_FACE_PATH, reason: 'heldByProbe' }]);
  });

  test('shows an outdated JetBrains cache while the catch-all child of its caches gives way', () => {
    const catchAllChild = buildCatalogOffer({
      path: JETBRAINS_CACHES_PATH,
      entryId: 'library-caches',
    });
    const unitOffer = buildIdeVersionOffer({
      product: 'IntelliJIdea',
      folderPath: `${JETBRAINS_CACHES_PATH}/IntelliJIdea2024.1`,
    });

    const report = buildReportOfPhases({
      reservedEntryPaths: [],
      phases: [[catchAllChild], [unitOffer]],
    });

    expect(listOfferedPaths(report)).toEqual([`${JETBRAINS_CACHES_PATH}/IntelliJIdea2024.1`]);
    expect(report.skipped).toEqual([{ path: JETBRAINS_CACHES_PATH, reason: 'heldByProbe' }]);
  });

  test('keeps offering the JetBrains caches whole while no outdated version has a unit', () => {
    const catchAllChild = buildCatalogOffer({
      path: JETBRAINS_CACHES_PATH,
      entryId: 'library-caches',
    });

    const report = buildReportOfPhases({ reservedEntryPaths: [], phases: [[catchAllChild], []] });

    expect(listOfferedPaths(report)).toEqual([JETBRAINS_CACHES_PATH]);
    expect(report.skipped).toEqual([]);
  });

  test('shows an outdated Android Studio cache beside the Chrome cache, which keeps its offer', () => {
    const chromeOffer = buildCatalogOffer({
      path: `${GOOGLE_CACHES_PATH}/Chrome`,
      entryId: 'chrome-cache',
    });
    const catchAllChild = buildCatalogOffer({
      path: GOOGLE_CACHES_PATH,
      entryId: 'library-caches',
    });
    const unitOffer = buildIdeVersionOffer({
      product: 'AndroidStudio',
      folderPath: `${GOOGLE_CACHES_PATH}/AndroidStudio2023.1`,
    });

    const report = buildReportOfPhases({
      reservedEntryPaths: [],
      phases: [[chromeOffer, catchAllChild], [unitOffer]],
    });

    expect(listOfferedPaths(report)).toEqual([
      `${GOOGLE_CACHES_PATH}/Chrome`,
      `${GOOGLE_CACHES_PATH}/AndroidStudio2023.1`,
    ]);
    expect(report.skipped).toEqual([
      { path: GOOGLE_CACHES_PATH, reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps a large file in Downloads that no unit names, while an installer a unit names gives way', () => {
    const largeFile = buildUserFileOffer({ path: `${DOWNLOADS_PATH}/archive.iso` });
    const installerFile = buildUserFileOffer({ path: INSTALLER_PATH });
    const installersOffer: CandidateDecision = {
      kind: 'offer',
      candidate: buildTestInstallersCandidate({
        downloadsPath: DOWNLOADS_PATH,
        installerPath: INSTALLER_PATH,
      }),
    };

    const report = buildReportOfPhases({
      reservedEntryPaths: [DOWNLOADS_PATH],
      phases: [[largeFile, installerFile], [installersOffer]],
    });

    expect(listOfferedPaths(report)).toEqual([`${DOWNLOADS_PATH}/archive.iso`, DOWNLOADS_PATH]);
    expect(report.skipped).toEqual([{ path: INSTALLER_PATH, reason: 'heldByProbe' }]);
  });

  test('holds back the large files in Downloads behind the advice of an installer probe that could not run', () => {
    const largeFile = buildUserFileOffer({ path: `${DOWNLOADS_PATH}/archive.iso` });
    const installerAdvice: Advice = {
      ...vscodeAdvice,
      origin: { kind: 'catalog', entryId: 'downloads-installers' },
      path: DOWNLOADS_PATH,
      title: 'Installers in Downloads',
      category: 'downloads',
      advice: 'Delete the installers of apps you installed.',
    };

    const report = buildReportOfPhases({
      reservedEntryPaths: [DOWNLOADS_PATH],
      phases: [[largeFile], [{ kind: 'advice', advice: installerAdvice }]],
    });

    expect(report.candidates).toEqual([]);
    expect(report.advice).toEqual([installerAdvice]);
    expect(report.skipped).toEqual([
      { path: `${DOWNLOADS_PATH}/archive.iso`, reason: 'overlapsEarlierCandidate' },
    ]);
  });

  test('keeps the installed apps beside the offers, never among them', () => {
    const app: AdvisedApp = {
      displayName: 'Example',
      installFolderPath: buildTestAbsolutePath({ text: `${HOME_DIR}/.vscode` }),
      estimatedBytes: 1024,
    };

    const report = buildScanReportOfPhases({
      environment: ENVIRONMENT,
      reservedEntryPaths: [],
      phases: [{ decisions: [vscodeOffer], issues: [] }],
      incompleteExploreAdvice: { decisions: [], issues: [] },
      appAdvice: { apps: [app], installedAppsPageName: 'Settings > Apps' },
      evictedEntryCount: 0,
    });

    expect(report.candidates).toEqual([vscodeCandidate]);
    expect(report.appAdvice).toEqual({ apps: [app], installedAppsPageName: 'Settings > Apps' });
  });
});

// The scans read the entries of the macOS catalog in a fixture home of the host, which only macOS
// lays out as those entries expect.
describeOnDarwin('runScan', () => {
  test('never shows a section larger while it scans than the report makes it, for a folder a probe claims', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const cachesPath = join(home.fixtureRoot.homeDir, 'Library/Caches');
        const jetBrainsCachesPath = join(cachesPath, 'JetBrains');
        const outdatedCachePath = join(jetBrainsCachesPath, 'IntelliJIdea2023.3');
        const files = [
          { path: join(cachesPath, 'com.example.app/cache.db'), sizeBytes: 2 * MIB },
          { path: join(outdatedCachePath, 'index.dat'), sizeBytes: 2 * MIB },
          { path: join(jetBrainsCachesPath, 'IntelliJIdea2024.1/index.dat'), sizeBytes: 4096 },
          {
            path: join(
              home.fixtureRoot.homeDir,
              'Library/Application Support/JetBrains/IntelliJIdea2024.1/options.xml',
            ),
            sizeBytes: 4096,
          },
        ];

        for (const file of files) {
          await createFixtureFile({
            path: file.path,
            sizeBytes: file.sizeBytes,
            modifiedMs: Date.UTC(2026, 0, 1),
          });
        }

        const progress: ScanProgress[] = [];
        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [
            getCatalogEntry('user-caches'),
            getCatalogEntry('jetbrains-ide-versions'),
          ],
          onProgress: (step) => progress.push(step),
        });
        const finalBytes = buildFinalSectionBytes(report);

        expect(listOfferedPaths(report)).toContain(outdatedCachePath);
        expect(report.skipped).toContainEqual({ path: jetBrainsCachesPath, reason: 'heldByProbe' });
        expect(progress.length).toBeGreaterThan(0);

        for (const step of progress) {
          for (const total of step.found) {
            expect(total.allocatedBytes).toBeLessThanOrEqual(finalBytes.get(total.sectionKey) ?? 0);
          }
        }
      },
    });
  });

  test('never counts a large file in a project SDK while it scans, which the report holds back for the probe', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const documentsPath = join(home.fixtureRoot.homeDir, 'Documents');
        const sdkRoot = join(documentsPath, 'AndroidSdk');
        const imageFolderPath = await writeAndroidSystemImage({
          sdkRoot: sdkRoot,
          platform: 'android-34',
          abi: 'arm64-v8a',
        });
        const imagePath = join(imageFolderPath, 'system.img');
        await createAndroidAvdHome({ environment: home.environment });
        await createFixtureFile({
          path: imagePath,
          sizeBytes: SCAN_LIMITS.minUserFileBytes,
          modifiedMs: Date.UTC(2025, 0, 1),
        });
        await writeFixtureTextFile({
          path: join(documentsPath, 'android-app/local.properties'),
          text: `sdk.dir=${sdkRoot}\n`,
        });

        const progress: ScanProgress[] = [];
        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('android-system-images')],
          onProgress: (step) => progress.push(step),
        });
        const finalBytes = buildFinalSectionBytes(report);

        expect(listOfferedPaths(report)).toContain(imageFolderPath);
        expect(report.skipped).toContainEqual({ path: imagePath, reason: 'heldByProbe' });
        expect(progress.map((step) => step.phase)).toContain('largeFiles');

        for (const step of progress) {
          for (const total of step.found) {
            expect(total.allocatedBytes).toBeLessThanOrEqual(finalBytes.get(total.sectionKey) ?? 0);
          }
        }
      },
    });
  });

  test('offers an old large file in a folder named like an artifact only while no marker is beside it', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const moviePath = join(home.fixtureRoot.homeDir, 'Movies/build/old.mov');
        await createFixtureFile({
          path: moviePath,
          sizeBytes: SCAN_LIMITS.minUserFileBytes,
          modifiedMs: Date.UTC(2025, 0, 1),
        });

        const unmarkedReport = await runTestScan({
          environment: home.environment,
          catalogEntries: [],
        });
        await writeFixtureTextFile({
          path: join(home.fixtureRoot.homeDir, 'Movies/build.gradle'),
          text: 'plugins {}\n',
        });
        const markedReport = await runTestScan({
          environment: home.environment,
          catalogEntries: [],
        });

        expect(listOfferedPaths(unmarkedReport)).toEqual([moviePath]);
        expect(listOfferedPaths(markedReport)).toEqual([]);
      },
    });
  });

  test('counts an edit in a folder of the project named like an artifact as its activity', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const oldMs = Date.UTC(2025, 0, 1);
        const projectPath = join(home.fixtureRoot.homeDir, 'Documents/app');
        const nodeModulesPath = join(projectPath, 'node_modules');
        const sourceBuildPath = join(projectPath, 'src/build');
        await createFixtureFile({
          path: join(projectPath, 'package.json'),
          sizeBytes: 64,
          modifiedMs: oldMs,
        });
        await createFixtureFile({
          path: join(nodeModulesPath, 'pkg/index.js'),
          sizeBytes: 2 * SCAN_LIMITS.minOfferedBytes,
          modifiedMs: oldMs,
        });
        await createFixtureFile({
          path: join(sourceBuildPath, 'generated.ts'),
          sizeBytes: 64,
          modifiedMs: Date.UTC(2026, 5, 28),
        });

        for (const folderPath of [
          join(nodeModulesPath, 'pkg'),
          nodeModulesPath,
          sourceBuildPath,
          join(projectPath, 'src'),
          projectPath,
        ]) {
          await updateModifiedMs({ path: folderPath, modifiedMs: oldMs });
        }

        const report = await runTestScan({ environment: home.environment, catalogEntries: [] });

        expect(listOfferedPaths(report)).toEqual([]);
        expect(report.skipped).toContainEqual({ path: nodeModulesPath, reason: 'recentActivity' });
      },
    });
  });

  test('advises deleting the folder of a removed Docker Desktop, never starting it', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const diskImagePath = join(
          home.fixtureRoot.homeDir,
          'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
        );
        await createFixtureFile({
          path: diskImagePath,
          sizeBytes: 2 * SCAN_LIMITS.minOfferedBytes,
          modifiedMs: Date.UTC(2026, 0, 1),
        });

        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('docker-desktop-disk-image')],
        });
        const diskImageAdvice = report.advice.find((advice) => advice.path === diskImagePath);

        expect(diskImageAdvice?.advice).toContain('Docker Desktop is no longer installed');
        expect(diskImageAdvice?.advice).not.toContain('Start');
      },
    });
  });

  test('offers no folder of the caches whose place an earlier entry read, though it offers nothing there', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const denoPath = join(home.fixtureRoot.homeDir, 'Library/Caches/deno');
        await createFixtureFile({
          path: join(denoPath, 'location_data/hash/kv.sqlite3'),
          sizeBytes: SCAN_LIMITS.minOfferedBytes,
          modifiedMs: Date.UTC(2026, 0, 1),
        });

        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('deno-cache'), getCatalogEntry('user-caches')],
        });

        expect(listOfferedPaths(report)).toEqual([]);
        expect(report.skipped).toContainEqual({
          path: denoPath,
          reason: 'overlapsEarlierCandidate',
        });
      },
    });
  });

  test('counts each entry its walks left in the cloud once, and none a walk passed by', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const oldMs = Date.UTC(2025, 0, 1);
        const homeDir = home.environment.homeDir;
        const projectPath = join(homeDir, 'Documents/app');
        // Met by the project walk and the large-file search, so counted once.
        const cloudFolderPath = join(homeDir, 'Movies/Cloud');
        const cloudFilePath = join(homeDir, 'Movies/cloud.mov');
        // Met only by the measurement of the artifact, which the project walk never enters.
        const cloudArtifactFilePath = join(projectPath, 'node_modules/pkg/cache.bin');
        // Passed by every walk, which never reads a hidden folder.
        const hiddenCloudFolderPath = join(homeDir, '.hidden/Cloud');

        await createFixtureFile({
          path: join(projectPath, 'package.json'),
          sizeBytes: 64,
          modifiedMs: oldMs,
        });
        await createFixtureFile({
          path: join(projectPath, 'node_modules/pkg/index.js'),
          sizeBytes: 2 * SCAN_LIMITS.minOfferedBytes,
          modifiedMs: oldMs,
        });

        for (const filePath of [
          cloudArtifactFilePath,
          cloudFilePath,
          join(cloudFolderPath, 'clip.mov'),
          join(hiddenCloudFolderPath, 'note.txt'),
        ]) {
          await createFixtureFile({ path: filePath, sizeBytes: 64, modifiedMs: oldMs });
        }

        const cloudOnlyPaths = [
          cloudFolderPath,
          cloudFilePath,
          cloudArtifactFilePath,
          hiddenCloudFolderPath,
        ];
        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [],
          entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: cloudOnlyPaths }),
        });

        expect(report.evictedEntryCount).toBe(3);
      },
    });
  });

  test('offers no item whose folder the entry reads call a link, and skips it as one', async () => {
    // As a mounted folder on Windows, which lstat calls a folder and its reparse point a link.
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const denoPath = join(home.fixtureRoot.homeDir, 'Library/Caches/deno');
        const remotePath = join(denoPath, 'remote');
        await createFixtureFile({
          path: join(remotePath, 'https/deno.land/module.ts'),
          sizeBytes: 2 * SCAN_LIMITS.minOfferedBytes,
          modifiedMs: Date.UTC(2026, 0, 1),
        });

        const plainReport = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('deno-cache')],
          entryReads: buildTestEntryReads({ privateBytes: null }),
        });
        const linkReport = await runTestScan({
          environment: home.environment,
          catalogEntries: [getCatalogEntry('deno-cache')],
          entryReads: buildTestEntryReads({ privateBytes: null, linkPaths: [remotePath] }),
        });

        expect(listOfferedPaths(plainReport)).toEqual([denoPath]);
        expect(listOfferedPaths(linkReport)).toEqual([]);
        expect(linkReport.skipped).toContainEqual({ path: denoPath, reason: 'symbolicLink' });
      },
    });
  });

  test('names a failed system call of the process listing by its call and its code', async () => {
    await withFixtureHome({
      nowMs: SCAN_NOW_MS,
      run: async (home) => {
        const report = await runTestScan({
          environment: home.environment,
          catalogEntries: [],
          runningProcesses: {
            kind: 'failed',
            failure: { reason: 'callFailed', call: 'Process32NextW', code: 5 },
          },
        });

        expect(report.issues).toContainEqual({
          path: 'Process32NextW',
          reason: 'commandFailed',
          detail: 'Process32NextW failed with 0x00000005',
        });
      },
    });
  });
});

/** The report of phases of the given decisions, with no advice of an incomplete probe. */
function buildReportOfPhases(params: {
  reservedEntryPaths: string[];
  phases: CandidateDecision[][];
}): ScanReport {
  return buildScanReportOfPhases({
    environment: ENVIRONMENT,
    reservedEntryPaths: params.reservedEntryPaths,
    phases: params.phases.map((decisions) => ({ decisions: decisions, issues: [] })),
    incompleteExploreAdvice: { decisions: [], issues: [] },
    appAdvice: null,
    evictedEntryCount: 0,
  });
}

function listOfferedPaths(report: ScanReport): string[] {
  return report.candidates.map((candidate) => candidate.path);
}

function buildCatalogOffer(params: { path: string; entryId: string }): CandidateDecision {
  return {
    kind: 'offer',
    candidate: buildTestCandidate({
      path: params.path,
      origin: { kind: 'catalog', entryId: params.entryId },
    }),
  };
}

function buildUserFileOffer(params: { path: string }): CandidateDecision {
  return {
    kind: 'offer',
    candidate: buildTestCandidate({
      path: params.path,
      category: 'downloads',
      kind: 'file',
      origin: { kind: 'userFile' },
    }),
  };
}

function buildUnitOffer(params: TestUnitPathsCandidateParams): CandidateDecision {
  return { kind: 'offer', candidate: buildTestUnitPathsCandidate(params) };
}

/** The caches folder of an outdated version of `product`, as the probe of IDE versions offers it. */
function buildIdeVersionOffer(params: { product: string; folderPath: string }): CandidateDecision {
  return {
    kind: 'offer',
    candidate: buildTestIdeVersionCandidate({
      product: params.product,
      version: '2023.1',
      folderPath: params.folderPath,
    }),
  };
}

/** The total of each section in the report, the way the scan view sums it. */
function buildFinalSectionBytes(report: ScanReport): Map<ConsumerSection, number> {
  const totals = buildSectionTotals({ candidates: report.candidates, advice: report.advice });

  return new Map(totals.map((total) => [total.sectionKey, total.allocatedBytes]));
}
