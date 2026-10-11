import type { CatalogEntry, Risk } from '../../src/catalog/catalog.js';
import type { Candidate } from '../../src/scan/candidate.js';
import type { Measurement } from '../../src/scan/loadPathMeasurement.js';
import type { FileIdentity, FileKind } from '../../src/system/loadFileIdentity.js';

let nextTestIno = 1000n;

export function buildTestIdentity(params: { realPath: string; kind?: FileKind }): FileIdentity {
  nextTestIno += 1n;

  return { dev: 1n, ino: nextTestIno, kind: params.kind ?? 'directory', realPath: params.realPath };
}

export function buildTestMeasurement(params: {
  realPath: string;
  allocatedBytes: number;
  kind?: FileKind;
  isComplete?: boolean;
}): Measurement {
  return {
    identity: buildTestIdentity({ realPath: params.realPath, kind: params.kind ?? 'directory' }),
    allocatedBytes: params.allocatedBytes,
    entryCount: 3,
    unreadableCount: 0,
    isComplete: params.isComplete ?? true,
  };
}

export function buildTestCandidate(params: {
  path: string;
  risk?: Risk;
  kind?: FileKind;
  allocatedBytes?: number;
}): Candidate {
  return {
    path: params.path,
    identity: buildTestIdentity({ realPath: params.path, kind: params.kind ?? 'directory' }),
    title: `Test item ${params.path}`,
    category: 'caches',
    risk: params.risk ?? 'safe',
    origin: 'catalog',
    explanation: 'A test item.',
    regeneration: 'Rebuilt by the test.',
    allocatedBytes: params.allocatedBytes ?? 4096,
    entryCount: 1,
    isComplete: true,
    ownerBundlePaths: [],
  };
}

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
    ownerBundleId: null,
    removal: { kind: 'delete' },
    ...overrides,
  };
}
