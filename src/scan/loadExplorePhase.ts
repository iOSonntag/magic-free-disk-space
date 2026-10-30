import type { CandidateCategory, CatalogEntry, ExploreProbeId } from '../catalog/catalog.js';
import type {
  ExploreFinding,
  ExplorePathUnit,
  ExploreToolUnit,
  ExploreUnit,
} from '../explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../explore/startExploreProbes.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { decideReadFailure } from '../system/readFailure.js';
import { buildReadIssue } from './buildReadIssue.js';
import type {
  CandidateDecision,
  CandidateProbed,
  CandidateRemovalDeleteUnitFolder,
  CandidateRemovalRunTool,
} from './candidate.js';
import type { ScanIssue } from './issue.js';
import type { UnitMeasurement } from './loadUnitMeasurement.js';
import { loadUnitMeasurement } from './loadUnitMeasurement.js';

/**
 * The decisions of the probes that ran, and the entries the scan decides through its catalog path
 * as advice: those whose probe did not run, and those whose probe judged only part of its units.
 */
export type ExplorePhase = {
  decisions: CandidateDecision[];
  issues: ScanIssue[];
  /** Entries whose probe did not run, so advice stands in place of their findings. */
  fallbackEntries: CatalogEntry[];
  /** Entries whose probe could not judge some or all of its units, so advice stands beside them. */
  incompleteEntries: CatalogEntry[];
};

/** What one finding adds: its decision, or the issue of a folder that could not be read. */
type ExploreFindingPhase = { decisions: CandidateDecision[]; issues: ScanIssue[] };

const EMPTY_FINDING_PHASE: ExploreFindingPhase = { decisions: [], issues: [] };

/** Waits for the probe of each explore entry and decides its findings, in entry order. */
export async function loadExplorePhase(params: {
  probes: Record<ExploreProbeId, Promise<ExploreProbeOutcome>>;
  catalogEntries: CatalogEntry[];
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExplorePhase> {
  const entryPhases = await Promise.all(
    params.catalogEntries.flatMap((entry) => {
      if (entry.removal.kind !== 'explore') {
        return [];
      }

      return [
        loadExploreEntryPhase({
          entry: entry,
          outcome: params.probes[entry.removal.probe],
          measureTimeoutMs: params.measureTimeoutMs,
          runItemMeasurement: params.runItemMeasurement,
        }),
      ];
    }),
  );

  return {
    decisions: entryPhases.flatMap((phase) => phase.decisions),
    issues: entryPhases.flatMap((phase) => phase.issues),
    fallbackEntries: entryPhases.flatMap((phase) => phase.fallbackEntries),
    incompleteEntries: entryPhases.flatMap((phase) => phase.incompleteEntries),
  };
}

async function loadExploreEntryPhase(params: {
  entry: CatalogEntry;
  outcome: Promise<ExploreProbeOutcome>;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExplorePhase> {
  const outcome = await params.outcome;

  switch (outcome.kind) {
    case 'probed': {
      const findingPhases = await Promise.all(
        outcome.findings.map((finding) =>
          loadExploreFindingPhase({
            finding: finding,
            category: params.entry.category,
            measureTimeoutMs: params.measureTimeoutMs,
            runItemMeasurement: params.runItemMeasurement,
          }),
        ),
      );

      return {
        decisions: findingPhases.flatMap((phase) => phase.decisions),
        issues: findingPhases.flatMap((phase) => phase.issues),
        fallbackEntries: [],
        incompleteEntries: outcome.isComplete ? [] : [params.entry],
      };
    }
    case 'toolMissing':
      return {
        decisions: [],
        issues: [],
        fallbackEntries: [params.entry],
        incompleteEntries: [],
      };
    case 'toolUntrusted':
      return {
        decisions: [],
        issues: [
          { path: outcome.failure.path, reason: 'toolUntrusted', detail: outcome.failure.detail },
        ],
        fallbackEntries: [params.entry],
        incompleteEntries: [],
      };
    case 'failed':
      return {
        decisions: [],
        issues: [{ path: outcome.tool.path, reason: 'toolFailed', failure: outcome.failure }],
        fallbackEntries: [params.entry],
        incompleteEntries: [],
      };
    case 'unreadable':
      return {
        decisions: [],
        issues: [buildReadIssue({ path: outcome.path, failure: outcome.failure })],
        fallbackEntries: [params.entry],
        incompleteEntries: [],
      };
  }
}

/**
 * Skips a busy finding as `ownerRunning` and one whose activity is unknown as `runningUnknown`,
 * both unmeasured; offers an idle one at any size.
 */
async function loadExploreFindingPhase(params: {
  finding: ExploreFinding;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExploreFindingPhase> {
  switch (params.finding.activity) {
    case 'busy':
      return {
        decisions: [{ kind: 'skip', path: params.finding.displayPath, reason: 'ownerRunning' }],
        issues: [],
      };
    case 'unknown':
      return {
        decisions: [{ kind: 'skip', path: params.finding.displayPath, reason: 'runningUnknown' }],
        issues: [],
      };
    case 'idle':
      return loadIdleFindingPhase(params);
  }
}

async function loadIdleFindingPhase(params: {
  finding: ExploreFinding;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExploreFindingPhase> {
  const unit = params.finding.unit;

  switch (unit.kind) {
    case 'simulatorDevice':
    case 'dartPubCache':
    case 'miseVersion':
    case 'simulatorRuntime':
    case 'androidAvd':
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
      return loadToolFindingOffer({ ...params, unit: unit });
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
      return loadPathFindingPhase({ ...params, unit: unit });
  }
}

/** Measures the unit's paths and offers it at any size, shown at the finding's place. */
async function loadToolFindingOffer(params: {
  finding: ExploreFinding;
  unit: ExploreToolUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExploreFindingPhase> {
  const measurement = await loadFindingMeasurement(params);
  const removal: CandidateRemovalRunTool = { kind: 'runTool', unit: params.unit };

  return buildOfferPhase(
    buildExploreCandidate({
      finding: params.finding,
      path: params.finding.displayPath,
      removal: removal,
      category: params.category,
      measurement: measurement,
    }),
  );
}

/**
 * Offers the unit's folder at any size with the identity it has now, which the deletion checks
 * again. A folder that vanished since the probe adds nothing, one that cannot be read adds a place
 * issue, and a symbolic link is skipped, since only the folder itself may be deleted.
 */
async function loadPathFindingPhase(params: {
  finding: ExploreFinding;
  unit: ExplorePathUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ExploreFindingPhase> {
  const identity = await loadFileIdentity({ path: params.unit.folderPath });

  if (identity.kind === 'failed') {
    const verdict = decideReadFailure(identity.failure);

    switch (verdict.kind) {
      case 'absent':
      case 'unfit':
        return EMPTY_FINDING_PHASE;
      case 'failed':
        return {
          decisions: [],
          issues: [buildReadIssue({ path: params.unit.folderPath, failure: verdict.failure })],
        };
    }
  }

  if (identity.value.kind === 'symbolicLink') {
    return {
      decisions: [{ kind: 'skip', path: params.unit.folderPath, reason: 'symbolicLink' }],
      issues: [],
    };
  }

  const measurement = await loadFindingMeasurement(params);
  const removal: CandidateRemovalDeleteUnitFolder = {
    kind: 'deleteUnitFolder',
    identity: identity.value,
    unit: params.unit,
  };

  return buildOfferPhase(
    buildExploreCandidate({
      finding: params.finding,
      path: params.unit.folderPath,
      removal: removal,
      category: params.category,
      measurement: measurement,
    }),
  );
}

function loadFindingMeasurement(params: {
  unit: ExploreUnit;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<UnitMeasurement> {
  return params.runItemMeasurement(() =>
    loadUnitMeasurement({
      unit: params.unit,
      deadlineMs: Date.now() + params.measureTimeoutMs,
    }),
  );
}

function buildOfferPhase(candidate: CandidateProbed): ExploreFindingPhase {
  return { decisions: [{ kind: 'offer', candidate: candidate }], issues: [] };
}

function buildExploreCandidate(params: {
  finding: ExploreFinding;
  path: string;
  removal: CandidateRemovalRunTool | CandidateRemovalDeleteUnitFolder;
  category: CandidateCategory;
  measurement: UnitMeasurement;
}): CandidateProbed {
  return {
    path: params.path,
    title: params.finding.title,
    category: params.category,
    risk: params.finding.risk,
    origin: 'explore',
    explanation: params.finding.explanation,
    regeneration: params.finding.regeneration,
    allocatedBytes: params.measurement.allocatedBytes,
    entryCount: params.measurement.entryCount,
    isComplete: params.measurement.isComplete,
    removal: params.removal,
    evidenceLines: params.finding.evidenceLines,
  };
}
