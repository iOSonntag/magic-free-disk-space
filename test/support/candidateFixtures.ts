import type {
  CandidateCategory,
  CatalogEntry,
  ExploreProbeId,
  Risk,
} from '../../src/catalog/catalog.js';
import type { ExplorePathUnit } from '../../src/explore/exploreUnit.js';
import type {
  Candidate,
  CandidateMatched,
  CandidateProbed,
  RemovalTarget,
  RemovalTargets,
} from '../../src/scan/candidate.js';
import type { TargetsMeasurement } from '../../src/scan/loadMeasuredTargetsPhase.js';
import type { Measurement } from '../../src/scan/loadPathMeasurement.js';
import type { FileIdentity, FileKind } from '../../src/system/loadFileIdentity.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
} from './parsedValueFixtures.js';

let nextTestIno = 1000n;

/** The facts of an item no source read: no fallback, no use, no download, no app. */
export const TEST_LISTING_FACTS_NONE = {
  privateSizeFallbackCount: 0,
  lastUsedAtMs: null,
  downloadedAtMs: null,
  appName: null,
};

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

export function buildTestCandidate(params: {
  path: string;
  title?: string;
  category?: CandidateCategory;
  risk?: Risk;
  kind?: FileKind;
  explanation?: string;
  regeneration?: string;
  allocatedBytes?: number;
  isComplete?: boolean;
  origin?: CandidateMatched['origin'];
  privateSizeFallbackCount?: number;
  lastUsedAtMs?: number | null;
  downloadedAtMs?: number | null;
  appName?: string | null;
}): CandidateMatched {
  return {
    path: params.path,
    title: params.title ?? `Test item ${params.path}`,
    category: params.category ?? 'caches',
    risk: params.risk ?? 'safe',
    origin: params.origin ?? { kind: 'catalog', entryId: 'test-entry' },
    explanation: params.explanation ?? 'A test item.',
    regeneration: params.regeneration ?? 'Rebuilt by the test.',
    allocatedBytes: params.allocatedBytes ?? 4096,
    entryCount: 1,
    isComplete: params.isComplete ?? true,
    privateSizeFallbackCount: params.privateSizeFallbackCount ?? 0,
    lastUsedAtMs: params.lastUsedAtMs ?? null,
    downloadedAtMs: params.downloadedAtMs ?? null,
    appName: params.appName ?? null,
    removal: {
      kind: 'deletePaths',
      targets: [
        {
          path: params.path,
          identity: buildTestIdentity({ realPath: params.path, kind: params.kind ?? 'directory' }),
        },
      ],
      ownerBundlePaths: [],
    },
  };
}

/** A tool item of a mise version under `homeDir`; its tool path is made up and never runs. */
export function buildTestToolCandidate(params: {
  homeDir: string;
  version: string;
  risk?: Risk;
  allocatedBytes?: number;
}): Candidate {
  const installPath = buildTestAbsolutePath({
    text: `${params.homeDir}/.local/share/mise/installs/node/${params.version}`,
  });

  return {
    path: installPath,
    title: `node ${params.version}`,
    category: 'developer',
    risk: params.risk ?? 'safe',
    origin: { kind: 'explore', probe: 'miseVersions' },
    explanation: 'A tool version no config file asks for.',
    regeneration: 'Installed again by mise when a project asks for it.',
    allocatedBytes: params.allocatedBytes ?? 8192,
    entryCount: 1,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'miseVersion',
        tool: { name: 'mise', path: `${params.homeDir}/.local/bin/mise` },
        miseToolName: buildTestMiseToolName({ text: 'node' }),
        version: buildTestMiseToolVersion({ text: params.version }),
        installPath: installPath,
      },
    },
    evidenceLines: [`mise prune would remove node@${params.version}`],
  };
}

/**
 * The tool item of the Dart pub cache under `homeDir`, whose tool has leading arguments; its tool
 * path is made up and never runs.
 */
export function buildTestDartToolCandidate(params: { homeDir: string }): Candidate {
  const cachePath = `${params.homeDir}/.pub-cache`;

  return {
    path: cachePath,
    title: 'Unused Dart and Flutter packages',
    category: 'developer',
    risk: 'review',
    origin: { kind: 'explore', probe: 'dartPubCache' },
    explanation: 'Package versions no active project uses.',
    regeneration: 'Downloaded again on `pub get`.',
    allocatedBytes: 8192,
    entryCount: 1,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'dartPubCache',
        tool: { name: 'dart', path: `${params.homeDir}/.local/bin/dart` },
        gcPaths: [buildTestAbsolutePath({ text: `${cachePath}/hosted/pub.dev/example_a-1.0.0` })],
      },
    },
    evidenceLines: ['`dart pub cache gc` would delete 1 cache entry'],
  };
}

/**
 * A probed item of `unit` shown at `path` and deleted as `targetPaths`, as `probe` would offer
 * it; its identities are made up.
 */
export function buildTestUnitPathsCandidate(params: {
  probe: ExploreProbeId;
  unit: ExplorePathUnit;
  path: string;
  targetPaths: RemovalTargets<string>;
}): CandidateProbed {
  const [firstTargetPath, ...restTargetPaths] = params.targetPaths;

  return {
    path: params.path,
    title: `Test unit ${params.path}`,
    category: 'developer',
    risk: 'review',
    origin: { kind: 'explore', probe: params.probe },
    explanation: 'A unit a test probe found.',
    regeneration: 'Downloaded again by the test.',
    allocatedBytes: 4096,
    entryCount: params.targetPaths.length,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
    removal: {
      kind: 'deleteUnitPaths',
      targets: [buildTestTarget(firstTargetPath), ...restTargetPaths.map(buildTestTarget)],
      unit: params.unit,
    },
    evidenceLines: ['A test probe found it.'],
  };
}

function buildTestTarget(path: string): RemovalTarget {
  return { path: path, identity: buildTestIdentity({ realPath: path }) };
}

/**
 * The build cache of Docker Desktop under `homeDir`, removed through its engine and shown at its
 * disk image; its socket is made up and never answers.
 */
export function buildTestEngineCandidate(params: {
  homeDir: string;
  allocatedBytes?: number;
}): CandidateProbed {
  const diskImagePath = buildTestAbsolutePath({
    text: `${params.homeDir}/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`,
  });
  const allocatedBytes = params.allocatedBytes ?? 8192;

  return {
    path: diskImagePath,
    title: 'Docker Desktop build cache',
    category: 'developer',
    risk: 'safe',
    origin: { kind: 'explore', probe: 'dockerDesktopEngine' },
    explanation: 'Build cache records no build used lately.',
    regeneration: 'Built again by the next build that needs them.',
    allocatedBytes: allocatedBytes,
    entryCount: 1,
    isComplete: true,
    ...TEST_LISTING_FACTS_NONE,
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
  };
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
