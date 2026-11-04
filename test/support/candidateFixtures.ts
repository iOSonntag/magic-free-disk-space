import type {
  CandidateCategory,
  CatalogEntry,
  ExploreProbeId,
  Risk,
} from '../../src/catalog/catalog.js';
import type {
  RemovalOutcomeCoded,
  RemovalOutcomeCodedKind,
} from '../../src/delete/deleteCandidates.js';
import type { ExplorePathUnit } from '../../src/explore/exploreUnit.js';
import type {
  Advice,
  Candidate,
  CandidateListing,
  CandidateMatched,
  CandidateProbed,
  CandidateRemovalDeletePaths,
  CandidateRemovalProbed,
  RemovalTarget,
  RemovalTargets,
  TargetsMeasurement,
} from '../../src/scan/candidate.js';
import type { Measurement } from '../../src/scan/loadPathMeasurement.js';
import type { FileIdentity, FileKind } from '../../src/system/loadFileIdentity.js';
import { mapNonEmpty } from '../../src/system/nonEmptyList.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';
import type { FixtureHome } from './parsedValueFixtures.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
  joinBelowHome,
} from './parsedValueFixtures.js';

let nextTestIno = 1000n;

export function buildTestIdentity(params: { realPath: string; kind?: FileKind }): FileIdentity {
  nextTestIno += 1n;

  return {
    dev: 1n,
    ino: nextTestIno,
    birthtimeNs: 1n,
    kind: params.kind ?? 'directory',
    realPath: params.realPath,
  };
}

export function buildTestMeasurement(params: {
  realPath: string;
  allocatedBytes: number;
  kind?: FileKind;
  isComplete?: boolean;
  latestModifiedMs?: number;
  holdsOtherVolume?: boolean;
}): Measurement {
  return {
    identity: buildTestIdentity({ realPath: params.realPath, kind: params.kind ?? 'directory' }),
    allocatedBytes: params.allocatedBytes,
    entryCount: 3,
    unreadableCount: 0,
    privateSizeFallbackCount: 0,
    isComplete: params.isComplete ?? true,
    latestModifiedMs: params.latestModifiedMs ?? 0,
    holdsOtherVolume: params.holdsOtherVolume ?? false,
  };
}

/** The measurement of the one target at `path`, as the targets phase gives it to a decide. */
export function buildTestTargetsMeasurement(params: {
  path: string;
  allocatedBytes: number;
  kind?: FileKind;
  isComplete?: boolean;
}): TargetsMeasurement {
  const { identity, ...measured } = buildTestMeasurement({
    realPath: params.path,
    allocatedBytes: params.allocatedBytes,
    kind: params.kind ?? 'directory',
    isComplete: params.isComplete ?? true,
  });

  return { ...measured, targets: [{ path: params.path, identity: identity }] };
}

/** What a test may set of an item's listing; each left out has a made-up value. */
export type TestListingParams = {
  path: string;
  title?: string;
  category?: CandidateCategory;
  risk?: Risk;
  explanation?: string;
  regeneration?: string;
  allocatedBytes?: number;
  entryCount?: number;
  isComplete?: boolean;
  privateSizeFallbackCount?: number;
  lastUsedAtMs?: number | null;
  downloadedAtMs?: number | null;
  appName?: string | null;
};

export function buildTestCandidate(
  params: TestListingParams & {
    kind?: FileKind;
    /** The real path of the one target, its path when left out. */
    realPath?: string;
    origin?: CandidateMatched['origin'];
    /** The removal when the one target at `path` will not do. */
    removal?: CandidateRemovalDeletePaths;
  },
): CandidateMatched {
  return {
    ...buildTestListing(params),
    origin: params.origin ?? { kind: 'catalog', entryId: 'test-entry' },
    removal: params.removal ?? {
      kind: 'deletePaths',
      targets: [
        {
          path: params.path,
          identity: buildTestIdentity({
            realPath: params.realPath ?? params.path,
            kind: params.kind ?? 'directory',
          }),
        },
      ],
      owner: { kind: 'none' },
    },
  };
}

/** An item the probe `probe` found, removed as `removal`. */
export function buildTestProbedCandidate(
  params: TestListingParams & {
    probe: ExploreProbeId;
    removal: CandidateRemovalProbed;
    evidenceLines?: string[];
  },
): CandidateProbed {
  return {
    ...buildTestListing(params),
    origin: { kind: 'explore', probe: params.probe },
    removal: params.removal,
    evidenceLines: params.evidenceLines ?? [],
  };
}

function buildTestListing(params: TestListingParams): CandidateListing {
  return {
    path: params.path,
    title: params.title ?? `Test item ${params.path}`,
    category: params.category ?? 'caches',
    risk: params.risk ?? 'safe',
    explanation: params.explanation ?? 'A test item.',
    regeneration: params.regeneration ?? 'Rebuilt by the test.',
    allocatedBytes: params.allocatedBytes ?? 4096,
    entryCount: params.entryCount ?? 1,
    isComplete: params.isComplete ?? true,
    privateSizeFallbackCount: params.privateSizeFallbackCount ?? 0,
    lastUsedAtMs: params.lastUsedAtMs ?? null,
    downloadedAtMs: params.downloadedAtMs ?? null,
    appName: params.appName ?? null,
  };
}

/** The advice of a place at `path`, each field left out made up. */
export function buildTestAdvice(overrides: Partial<Advice> & { path: string }): Advice {
  return {
    origin: { kind: 'catalog', entryId: 'test-entry' },
    title: `Test advice ${overrides.path}`,
    category: 'caches',
    risk: 'review',
    explanation: 'A place for tests.',
    advice: 'Handle it in its own app.',
    opener: null,
    carvedPaths: [],
    allocatedBytes: 4096,
    isComplete: true,
    privateSizeFallbackCount: 0,
    lastUsedAtMs: null,
    downloadedAtMs: null,
    appName: null,
    ...overrides,
  };
}

/** How the removal of `candidate` ended; no code when `code` is left out. */
export function buildTestRemovalOutcome(params: {
  candidate: Candidate;
  outcome: RemovalOutcomeCodedKind;
  freedBytes: number;
  code?: string | null;
}): RemovalOutcomeCoded {
  return {
    candidate: params.candidate,
    freedBytes: params.freedBytes,
    outcome: params.outcome,
    code: params.code ?? null,
  };
}

/** A tool item of a mise version below the home; its tool path is made up and never runs. */
export function buildTestToolCandidate(params: {
  home: FixtureHome;
  version: string;
  risk?: Risk;
  allocatedBytes?: number;
}): Candidate {
  const installPath = joinBelowHome({
    home: params.home,
    path: `.local/share/mise/installs/node/${params.version}`,
  });

  return buildTestProbedCandidate({
    path: installPath,
    title: `node ${params.version}`,
    category: 'developer',
    risk: params.risk ?? 'safe',
    probe: 'miseVersions',
    explanation: 'A tool version no config file asks for.',
    regeneration: 'Installed again by mise when a project asks for it.',
    allocatedBytes: params.allocatedBytes ?? 8192,
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'miseVersion',
        tool: { name: 'mise', path: joinBelowHome({ home: params.home, path: '.local/bin/mise' }) },
        miseToolName: buildTestMiseToolName({ text: 'node' }),
        version: buildTestMiseToolVersion({ text: params.version }),
        installPath: installPath,
      },
    },
    evidenceLines: [`mise prune would remove node@${params.version}`],
  });
}

/**
 * The tool item of the Dart pub cache below the home, whose tool has leading arguments; its tool
 * path is made up and never runs.
 */
export function buildTestDartToolCandidate(params: { home: FixtureHome }): Candidate {
  const cachePath = joinBelowHome({ home: params.home, path: '.pub-cache' });

  return buildTestProbedCandidate({
    path: cachePath,
    title: 'Unused Dart and Flutter packages',
    category: 'developer',
    risk: 'review',
    probe: 'dartPubCache',
    explanation: 'Package versions no active project uses.',
    regeneration: 'Downloaded again on `pub get`.',
    allocatedBytes: 8192,
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'dartPubCache',
        tool: { name: 'dart', path: joinBelowHome({ home: params.home, path: '.local/bin/dart' }) },
        gcPaths: [
          joinBelowHome({ home: params.home, path: '.pub-cache/hosted/pub.dev/example_a-1.0.0' }),
        ],
      },
    },
    evidenceLines: ['`dart pub cache gc` would delete 1 cache entry'],
  });
}

export type TestUnitPathsCandidateParams = {
  probe: ExploreProbeId;
  unit: ExplorePathUnit;
  path: string;
  targetPaths: RemovalTargets<string>;
};

/**
 * A probed item of `unit` shown at `path` and deleted as `targetPaths`, as `probe` would offer
 * it; its identities are made up.
 */
export function buildTestUnitPathsCandidate(params: TestUnitPathsCandidateParams): CandidateProbed {
  return buildTestProbedCandidate({
    path: params.path,
    title: `Test unit ${params.path}`,
    category: 'developer',
    risk: 'review',
    probe: params.probe,
    explanation: 'A unit a test probe found.',
    regeneration: 'Downloaded again by the test.',
    entryCount: params.targetPaths.length,
    removal: {
      kind: 'deleteUnitPaths',
      targets: mapNonEmpty(params.targetPaths, buildTestTarget),
      unit: params.unit,
    },
    evidenceLines: ['A test probe found it.'],
  });
}

function buildTestTarget(path: string): RemovalTarget {
  return { path: path, identity: buildTestIdentity({ realPath: path }) };
}

/** The caches folder `folderPath` of an outdated `product` `version`, as the probe of IDE versions offers it. */
export function buildTestIdeVersionCandidate(params: {
  product: string;
  version: string;
  folderPath: string;
}): CandidateProbed {
  const folderPath = buildTestAbsolutePath({ text: params.folderPath });

  return buildTestUnitPathsCandidate({
    probe: 'ideVersions',
    unit: {
      kind: 'ideVersionFolder',
      product: params.product,
      version: params.version,
      folderKind: 'caches',
      folderPath: folderPath,
      foundPaths: [folderPath],
    },
    path: params.folderPath,
    targetPaths: [params.folderPath],
  });
}

/** The one old installer at `installerPath` in `downloadsPath`, as the probe of installers offers it. */
export function buildTestInstallersCandidate(params: {
  downloadsPath: string;
  installerPath: string;
}): CandidateProbed {
  return buildTestUnitPathsCandidate({
    probe: 'downloadsInstallers',
    unit: {
      kind: 'downloadsInstallers',
      folderPath: buildTestAbsolutePath({ text: params.downloadsPath }),
      cutoffMs: 0,
      foundFiles: [{ path: buildTestAbsolutePath({ text: params.installerPath }), modifiedMs: 0 }],
    },
    path: params.downloadsPath,
    targetPaths: [params.installerPath],
  });
}

/**
 * The build cache of Docker Desktop under `homeDir`, removed through its engine and shown at its
 * disk image; its socket is made up and never answers.
 */
export function buildTestEngineCandidate(params: {
  homeDir: string;
  allocatedBytes?: number;
  /** `Docker Desktop build cache` when left out. */
  title?: string;
}): CandidateProbed {
  const diskImagePath = buildTestAbsolutePath({
    text: `${params.homeDir}/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`,
  });
  const allocatedBytes = params.allocatedBytes ?? 8192;

  return buildTestProbedCandidate({
    path: diskImagePath,
    title: params.title ?? 'Docker Desktop build cache',
    category: 'developer',
    risk: 'safe',
    probe: 'dockerDesktopEngine',
    explanation: 'Build cache records no build used lately.',
    regeneration: 'Built again by the next build that needs them.',
    allocatedBytes: allocatedBytes,
    removal: {
      kind: 'callEngine',
      unit: {
        kind: 'engineBuildCache',
        engineProbeId: 'dockerDesktopEngine',
        engineName: 'Docker Desktop',
        socketPath: buildTestAbsolutePath({ text: `${params.homeDir}/.docker/run/docker.sock` }),
        diskImagePath: diskImagePath,
        sizeBytes: allocatedBytes,
        recordIds: [],
      },
    },
    evidenceLines: ['Docker Desktop reports these records unused.'],
  });
}

/** No place for any tool, so a scan in a test never runs a real tool. */
export const TOOL_INSTALL_LOCATIONS_NONE: ToolInstallLocations = {
  xcrun: [],
  dart: [],
  mise: [],
  brewAppleSilicon: [],
  brewIntel: [],
  avdmanager: [],
  asdf: [],
  brctl: [],
  vagrant: [],
  rustup: [],
  conda: [],
  fvm: [],
};

export function buildTestCatalogEntry(overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: 'test-entry',
    category: 'caches',
    title: 'Test cache',
    explanation: 'A cache for tests.',
    regeneration: 'Rebuilt by the test.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/Test',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
    ...overrides,
  };
}
