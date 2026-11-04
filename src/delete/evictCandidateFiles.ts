import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import { isEvictFileUnchanged } from '../explore/icloudDownloads/decideEvictFile.js';
import type { Candidate, CandidateRemovalEvictUnitFiles, EvictTarget } from '../scan/candidate.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { mapNonEmpty, mapNonEmptyInTurn } from '../system/nonEmptyList.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { loadTrustedTool } from '../tools/findTrustedTool.js';
import { runToolCommand } from '../tools/runToolCommand.js';
import type { ToolProcessPlatform } from '../tools/toolsPlatform.js';
import { decideTargetsOutcome } from './decideTargetsOutcome.js';
import type {
  RecordedRemoval,
  RemovalOutcome,
  RemovalOutcomeCodedKind,
  RemovalOutcomeKind,
} from './deleteCandidates.js';
import type { JournalEntry } from './deletionJournal.js';
import { fileFailureToOutcome } from './fileFailureToOutcome.js';

/** One file's evict asks the cloud daemon to drop its copy, which returns long before this. */
const EVICT_FILE_TIMEOUT_MS = 60_000;

type EvictFileOutcomeCoded = {
  kind: 'coded';
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
  freedBytes: number;
};

type EvictFileOutcomeToolFailed = { kind: 'toolFailed'; path: string; failure: ExploreToolFailure };

/** What became of one file, with the blocks its evict freed. */
type EvictFileOutcome = EvictFileOutcomeCoded | EvictFileOutcomeToolFailed;

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
  /** How the evict tool's process starts and ends. */
  toolProcesses: ToolProcessPlatform;
  clock: () => number;
}): Promise<RecordedRemoval> {
  const trustedTool = await loadTrustedTool({
    name: params.removal.unit.tool.name,
    path: params.removal.unit.tool.path,
    user: params.environment.user,
  });
  const evictTarget = (target: EvictTarget): Promise<EvictFileOutcome> => {
    if (trustedTool.kind === 'failed') {
      return Promise.resolve(
        buildKeptOutcome({ path: target.path, outcome: 'changedSinceScan', code: null }),
      );
    }

    return evictFile({
      target: target,
      tool: trustedTool.value,
      environment: params.environment,
      toolProcesses: params.toolProcesses,
    });
  };

  // One after another: each file is checked right before its own evict.
  const fileOutcomes = await mapNonEmptyInTurn(params.removal.targets, evictTarget);
  const atMs = params.clock();

  return {
    outcome: buildEvictOutcome({ candidate: params.candidate, fileOutcomes: fileOutcomes }),
    outcomeEntries: mapNonEmpty(fileOutcomes, (fileOutcome) =>
      buildEvictionEntry({ fileOutcome: fileOutcome, atMs: atMs }),
    ),
  };
}

async function evictFile(params: {
  target: EvictTarget;
  tool: LocatedTool;
  environment: Environment;
  toolProcesses: ToolProcessPlatform;
}): Promise<EvictFileOutcome> {
  const stats = await loadEntryStats({ path: params.target.path });

  if (stats.kind === 'failed') {
    const failedOutcome = fileFailureToOutcome(stats.failure);

    return buildKeptOutcome({
      path: params.target.path,
      outcome: failedOutcome.outcome,
      code: failedOutcome.code,
    });
  }

  // Changed, read, replaced, or already evicted since the scan: kept, as the person may use it.
  if (
    !isEvictFileUnchanged({
      stats: stats.value,
      identity: params.target.identity,
      modifiedMs: params.target.modifiedMs,
      accessedMs: params.target.accessedMs,
    })
  ) {
    return buildKeptOutcome({ path: params.target.path, outcome: 'changedSinceScan', code: null });
  }

  const evicted = await runToolCommand({
    tool: params.tool,
    args: ['evict', params.target.path],
    homeDir: params.environment.homeDir,
    tempDir: params.environment.tempDir,
    timeoutMs: EVICT_FILE_TIMEOUT_MS,
    processes: params.toolProcesses,
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
    freedBytes: stats.value.allocatedBytes,
  };
}

function buildKeptOutcome(params: {
  path: string;
  outcome: RemovalOutcomeCodedKind;
  code: string | null;
}): EvictFileOutcome {
  return {
    kind: 'coded',
    path: params.path,
    outcome: params.outcome,
    code: params.code,
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
  const base = { candidate: params.candidate, freedBytes: freedBytes };
  const decision = decideTargetsOutcome({
    targets: params.fileOutcomes,
    getOutcome: getFileOutcomeKind,
  });

  switch (decision.kind) {
    case 'gone':
      return { ...base, outcome: decision.outcome, code: null };
    case 'stayed':
      return buildKeptFileOutcome({ base: base, keptOutcome: decision.target });
  }
}

function buildKeptFileOutcome(params: {
  base: { candidate: Candidate; freedBytes: number };
  keptOutcome: EvictFileOutcome;
}): RemovalOutcome {
  switch (params.keptOutcome.kind) {
    case 'toolFailed':
      return { ...params.base, outcome: 'toolFailed', failure: params.keptOutcome.failure };
    case 'coded':
      return { ...params.base, outcome: params.keptOutcome.outcome, code: params.keptOutcome.code };
  }
}

function getFileOutcomeKind(fileOutcome: EvictFileOutcome): RemovalOutcomeKind {
  switch (fileOutcome.kind) {
    case 'toolFailed':
      return 'toolFailed';
    case 'coded':
      return fileOutcome.outcome;
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
