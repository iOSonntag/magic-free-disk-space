import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import { isEvictFileUnchanged } from '../explore/icloudDownloads/decideEvictFile.js';
import type { Candidate, CandidateRemovalEvictUnitFiles, EvictTarget } from '../scan/candidate.js';
import { loadEntryTimes } from '../system/loadEntryTimes.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { loadTrustedTool } from '../tools/findTrustedTool.js';
import { runToolCommand } from '../tools/runToolCommand.js';
import type {
  RecordedRemoval,
  RemovalOutcome,
  RemovalOutcomeCodedKind,
} from './deleteCandidates.js';
import type { JournalEntry } from './deletionJournal.js';

/** One file's evict asks the cloud daemon to drop its copy, which returns long before this. */
const EVICT_FILE_TIMEOUT_MS = 60_000;

/** What became of one file, with the blocks its evict freed. */
type EvictFileOutcome =
  | {
      kind: 'coded';
      path: string;
      outcome: RemovalOutcomeCodedKind;
      code: string | null;
      freedBytes: number;
    }
  | { kind: 'toolFailed'; path: string; failure: ExploreToolFailure };

/**
 * Evicts each target with `brctl evict`, only while it is still the file the scan found, still
 * downloaded, and untouched since; any other file is kept and counts as kept, as is every file
 * when the tool is no longer the one the scan trusted. One `eviction` entry per target. Each
 * file's blocks are what its evict frees. Never rejects.
 */
export async function evictCandidateFiles(params: {
  candidate: Candidate;
  removal: CandidateRemovalEvictUnitFiles;
  environment: Environment;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const trustedTool = await loadTrustedTool({
    name: params.removal.unit.tool.name,
    path: params.removal.unit.tool.path,
    user: params.environment.user,
  });
  const [firstTarget, ...otherTargets] = params.removal.targets;
  const evictTarget = (target: EvictTarget): Promise<EvictFileOutcome> => {
    if (trustedTool.kind === 'failed') {
      return Promise.resolve(buildKeptOutcome({ path: target.path, outcome: 'changedSinceScan' }));
    }

    return evictFile({ target: target, tool: trustedTool.value, environment: params.environment });
  };

  // One after another: each file is checked right before its own evict.
  const firstOutcome = await evictTarget(firstTarget);
  const otherOutcomes: EvictFileOutcome[] = [];

  for (const target of otherTargets) {
    otherOutcomes.push(await evictTarget(target));
  }

  const fileOutcomes: [EvictFileOutcome, ...EvictFileOutcome[]] = [firstOutcome, ...otherOutcomes];
  const atMs = params.clock();
  const buildEntry = (fileOutcome: EvictFileOutcome): JournalEntry =>
    buildEvictionEntry({ fileOutcome: fileOutcome, atMs: atMs });

  return {
    outcome: buildEvictOutcome({ candidate: params.candidate, fileOutcomes: fileOutcomes }),
    outcomeEntries: [buildEntry(firstOutcome), ...otherOutcomes.map(buildEntry)],
  };
}

async function evictFile(params: {
  target: EvictTarget;
  tool: LocatedTool;
  environment: Environment;
}): Promise<EvictFileOutcome> {
  const times = await loadEntryTimes({ path: params.target.path });

  if (times.kind === 'failed') {
    switch (times.failure.reason) {
      case 'missing':
        return buildKeptOutcome({ path: params.target.path, outcome: 'alreadyGone' });
      case 'permissionDenied':
        return buildKeptOutcome({
          path: params.target.path,
          outcome: 'permissionDenied',
          code: times.failure.code,
        });
      case 'unexpected':
        return buildKeptOutcome({
          path: params.target.path,
          outcome: 'failed',
          code: times.failure.code,
        });
    }
  }

  // Changed, read, replaced, or already evicted since the scan: kept, as the person may use it.
  if (
    !isEvictFileUnchanged({
      times: times.value,
      identity: params.target.identity,
      modifiedMs: params.target.modifiedMs,
      accessedMs: params.target.accessedMs,
    })
  ) {
    return buildKeptOutcome({ path: params.target.path, outcome: 'changedSinceScan' });
  }

  const evicted = await runToolCommand({
    tool: params.tool,
    args: ['evict', params.target.path],
    homeDir: params.environment.homeDir,
    tempDir: params.environment.tempDir,
    timeoutMs: EVICT_FILE_TIMEOUT_MS,
  });

  // `brctl` documents no exit status, so any but 0 keeps the file.
  if (evicted.kind === 'failed') {
    return {
      kind: 'toolFailed',
      path: params.target.path,
      failure: { reason: 'commandFailed', failure: evicted.failure },
    };
  }

  return {
    kind: 'coded',
    path: params.target.path,
    outcome: 'removed',
    code: null,
    freedBytes: times.value.allocatedBytes,
  };
}

function buildKeptOutcome(params: {
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code?: string;
}): EvictFileOutcome {
  return {
    kind: 'coded',
    path: params.path,
    outcome: params.outcome,
    code: params.code ?? null,
    freedBytes: 0,
  };
}

/**
 * `removed` once every file went, `alreadyGone` when none was there; else the first file kept
 * names the outcome, with the blocks of the files that went freed.
 */
function buildEvictOutcome(params: {
  candidate: Candidate;
  fileOutcomes: [EvictFileOutcome, ...EvictFileOutcome[]];
}): RemovalOutcome {
  const freedBytes = params.fileOutcomes.reduce(
    (total, fileOutcome) => total + (fileOutcome.kind === 'coded' ? fileOutcome.freedBytes : 0),
    0,
  );
  const base = {
    candidate: params.candidate,
    path: params.candidate.path,
    allocatedBytes: params.candidate.allocatedBytes,
    freedBytes: freedBytes,
  };
  const keptOutcome = params.fileOutcomes.find(
    (fileOutcome) =>
      fileOutcome.kind === 'toolFailed' ||
      (fileOutcome.outcome !== 'removed' && fileOutcome.outcome !== 'alreadyGone'),
  );

  if (keptOutcome === undefined) {
    const hasEvicted = params.fileOutcomes.some(
      (fileOutcome) => fileOutcome.kind === 'coded' && fileOutcome.outcome === 'removed',
    );

    return { ...base, outcome: hasEvicted ? 'removed' : 'alreadyGone', code: null };
  }

  switch (keptOutcome.kind) {
    case 'toolFailed':
      return { ...base, outcome: 'toolFailed', failure: keptOutcome.failure };
    case 'coded':
      return { ...base, outcome: keptOutcome.outcome, code: keptOutcome.code };
  }
}

function buildEvictionEntry(params: { fileOutcome: EvictFileOutcome; atMs: number }): JournalEntry {
  switch (params.fileOutcome.kind) {
    case 'toolFailed':
      return {
        kind: 'eviction',
        atMs: params.atMs,
        path: params.fileOutcome.path,
        outcome: 'toolFailed',
        failure: params.fileOutcome.failure,
      };
    case 'coded':
      return {
        kind: 'eviction',
        atMs: params.atMs,
        path: params.fileOutcome.path,
        outcome: params.fileOutcome.outcome,
        code: params.fileOutcome.code,
      };
  }
}
