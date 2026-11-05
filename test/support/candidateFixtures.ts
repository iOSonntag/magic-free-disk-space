import type { CandidateCategory, CatalogEntry, Risk } from '../../src/catalog/catalog.js';
import type { Candidate, CandidateMatched } from '../../src/scan/candidate.js';
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
      kind: 'deletePath',
      identity: buildTestIdentity({ realPath: params.path, kind: params.kind ?? 'directory' }),
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

/** No place for any tool, so a scan in a test never runs a real tool. */
export const TOOL_INSTALL_LOCATIONS_NONE: ToolInstallLocations = {
  xcrun: [],
  dart: [],
  mise: [],
  brewAppleSilicon: [],
  brewIntel: [],
  avdmanager: [],
  asdf: [],
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
    scope: 'self',
    ageRule: 'none',
    owner: null,
    removal: { kind: 'delete' },
    ...overrides,
  };
}
