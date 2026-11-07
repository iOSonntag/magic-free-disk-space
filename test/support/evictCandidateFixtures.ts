import type { ExploreFoundEvictFile } from '../../src/explore/exploreUnit.js';
import type { CandidateProbed, EvictTarget, RemovalTargets } from '../../src/scan/candidate.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { mapNonEmpty } from '../../src/system/nonEmptyList.js';
import { buildTestIdentity, buildTestProbedCandidate } from './candidateFixtures.js';
import { buildTestAbsolutePath } from './parsedValueFixtures.js';

/** An evict target at `path` whose identity no disk read, with times of the epoch. */
export function buildTestEvictTarget(params: { path: string; kind?: FileKind }): EvictTarget {
  return {
    path: params.path,
    identity: buildTestIdentity({ realPath: params.path, kind: params.kind ?? 'file' }),
    modifiedMs: 0,
    accessedMs: 0,
  };
}

/**
 * An iCloud folder's evict item of `targets` in `folderPath`; its `brctl` is the one at `toolPath`,
 * made up unless a test writes a fake there.
 */
export function buildTestEvictCandidate(params: {
  folderPath: string;
  targets: RemovalTargets<EvictTarget>;
  toolPath?: string;
  allocatedBytes?: number;
}): CandidateProbed {
  return buildTestProbedCandidate({
    path: params.folderPath,
    title: `Test iCloud folder ${params.folderPath}`,
    category: 'cloudCopies',
    risk: 'review',
    probe: 'icloudDownloads',
    explanation: 'Files iCloud Drive keeps that a test probe found downloaded.',
    regeneration: 'Downloaded again from iCloud Drive when opened.',
    allocatedBytes: params.allocatedBytes ?? 4096,
    entryCount: params.targets.length,
    removal: {
      kind: 'evictUnitFiles',
      targets: params.targets,
      unit: {
        kind: 'icloudFolder',
        tool: { name: 'brctl', path: params.toolPath ?? '/usr/bin/brctl' },
        folderPath: buildTestAbsolutePath({ text: params.folderPath }),
        cutoffMs: 0,
        foundFiles: mapNonEmpty(params.targets, buildFoundEvictFile),
      },
    },
    evidenceLines: ['A test probe found it.'],
  });
}

function buildFoundEvictFile(target: EvictTarget): ExploreFoundEvictFile {
  return {
    path: buildTestAbsolutePath({ text: target.path }),
    modifiedMs: target.modifiedMs,
    accessedMs: target.accessedMs,
  };
}
