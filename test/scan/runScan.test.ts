import { expect, test } from 'bun:test';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { Advice, CandidateDecision } from '../../src/scan/candidate.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestUnitPathsCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

const HOME_DIR = '/Users/example';

const HUGGING_FACE_PATH = `${HOME_DIR}/.cache/huggingface`;

const HUGGING_FACE_HUB_PATH = `${HUGGING_FACE_PATH}/hub`;

const JETBRAINS_CACHES_PATH = `${HOME_DIR}/Library/Caches/JetBrains`;

const GOOGLE_CACHES_PATH = `${HOME_DIR}/Library/Caches/Google`;

const DOWNLOADS_PATH = `${HOME_DIR}/Downloads`;

const INSTALLER_PATH = `${DOWNLOADS_PATH}/Example-1.0.dmg`;

const vscodeAdvice: Advice = {
  origin: { kind: 'catalog', entryId: 'vscode-extensions' },
  path: `${HOME_DIR}/.vscode/extensions`,
  title: 'VS Code extensions',
  category: 'developer',
  risk: 'review',
  explanation: 'Extensions VS Code installed.',
  advice: 'Uninstall the extensions you no longer use in VS Code.',
  opener: null,
  carvedPaths: [],
  allocatedBytes: 65_536,
  isComplete: true,
  ...TEST_LISTING_FACTS_NONE,
};

const vscodeCandidate = buildTestVscodeExtensionCandidate({ homeDir: HOME_DIR });

const vscodeOffer: CandidateDecision = { kind: 'offer', candidate: vscodeCandidate };

describeAwaitingWin32Platform('buildScanReportOfPhases', () => {
  test('keeps the offers of an incomplete probe and shows the advice of its entry', () => {
    const report = buildScanReportOfPhases({
      pathRules: DARWIN_PATH_RULES,
      reservedEntryPaths: [vscodeAdvice.path],
      phases: [{ decisions: [vscodeOffer], issues: [] }],
      incompleteExploreAdvice: {
        decisions: [{ kind: 'advice', advice: vscodeAdvice }],
        issues: [{ path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' }],
      },
    });

    expect(report.candidates).toEqual([vscodeCandidate]);
    expect(report.advice).toEqual([vscodeAdvice]);
    expect(report.skipped).toEqual([]);
    expect(report.issues).toEqual([
      { path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' },
    ]);
  });

  test('would hold back those offers if the advice took part in the dedupe', () => {
    const report = buildScanReportOfPhases({
      pathRules: DARWIN_PATH_RULES,
      reservedEntryPaths: [vscodeAdvice.path],
      phases: [{ decisions: [vscodeOffer, { kind: 'advice', advice: vscodeAdvice }], issues: [] }],
      incompleteExploreAdvice: { decisions: [], issues: [] },
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
    const installersOffer = buildUnitOffer({
      probe: 'downloadsInstallers',
      unit: {
        kind: 'downloadsInstallers',
        folderPath: buildTestAbsolutePath({ text: DOWNLOADS_PATH }),
        cutoffMs: 0,
        foundFiles: [{ path: buildTestAbsolutePath({ text: INSTALLER_PATH }), modifiedMs: 0 }],
      },
      path: DOWNLOADS_PATH,
      targetPaths: [INSTALLER_PATH],
    });

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
});

/** The report of phases of the given decisions, with no advice of an incomplete probe. */
function buildReportOfPhases(params: {
  reservedEntryPaths: string[];
  phases: CandidateDecision[][];
}): ScanReport {
  return buildScanReportOfPhases({
    pathRules: DARWIN_PATH_RULES,
    reservedEntryPaths: params.reservedEntryPaths,
    phases: params.phases.map((decisions) => ({ decisions: decisions, issues: [] })),
    incompleteExploreAdvice: { decisions: [], issues: [] },
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

function buildUnitOffer(
  params: Parameters<typeof buildTestUnitPathsCandidate>[0],
): CandidateDecision {
  return { kind: 'offer', candidate: buildTestUnitPathsCandidate(params) };
}

/** The caches folder of an outdated version of `product`, as the probe of IDE versions offers it. */
function buildIdeVersionOffer(params: { product: string; folderPath: string }): CandidateDecision {
  return buildUnitOffer({
    probe: 'ideVersions',
    unit: {
      kind: 'ideVersionFolder',
      product: params.product,
      version: '2023.1',
      folderKind: 'caches',
      folderPath: buildTestAbsolutePath({ text: params.folderPath }),
      foundPaths: [buildTestAbsolutePath({ text: params.folderPath })],
    },
    path: params.folderPath,
    targetPaths: [params.folderPath],
  });
}
