import type { CandidateCategory, CatalogEntry, ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreFinding, ExplorePathUnit, ExploreToolUnit } from '../explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../explore/startExploreProbes.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import { buildReadIssue } from './buildReadIssue.js';
import type {
  CandidateDecision,
  CandidateProbed,
  CandidateRemovalDeleteUnitFolder,
  CandidateRemovalRunTool,
} from './candidate.js';
import { getCatalogEntryPath } from './getCatalogEntryPath.js';
import type { ScanIssue } from './issue.js';
import { loadMeasuredPhase } from './loadMeasuredPhase.js';
import type { UnitMeasurement } from './loadUnitMeasurement.js';
import { loadUnitMeasurement } from './loadUnitMeasurement.js';
import type { ScanPhase } from './scanPhase.js';
import { mergeScanPhases } from './scanPhase.js';

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

/**
 * Waits for the probe of each explore entry and decides its findings, in entry order. A probe that
 * ran past its deadline adds a `walkStopped` issue at its entry's path.
 */
export async function loadExplorePhase(params: {
  environment: Environment;
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
          environment: params.environment,
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
  environment: Environment;
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
      const merged = mergeScanPhases({ phases: findingPhases });

      return {
        decisions: merged.decisions,
        issues: merged.issues,
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
    case 'timedOut': {
      const deadlineIssue: ScanIssue = {
        path: getCatalogEntryPath({ environment: params.environment, entry: params.entry }),
        reason: 'walkStopped',
        detail: 'deadline',
      };

      return {
        decisions: [],
        issues: [deadlineIssue],
        fallbackEntries: [params.entry],
        incompleteEntries: [],
      };
    }
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
}): Promise<ScanPhase> {
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
}): Promise<ScanPhase> {
  const unit = params.finding.unit;

  switch (unit.kind) {
    case 'simulatorDevice':
    case 'dartPubCache':
    case 'miseVersion':
    case 'simulatorRuntime':
    case 'androidAvd':
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
    case 'asdfVersion':
      return loadToolFindingPhase({ ...params, unit: unit });
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
      return loadPathFindingPhase({ ...params, unit: unit });
  }
}

/**
 * Measures the unit's paths and offers it at any size, shown at the finding's place. Its tool
 * decides what it removes, so a path holding another volume does not skip it.
 */
async function loadToolFindingPhase(params: {
  finding: ExploreFinding;
  unit: ExploreToolUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ScanPhase> {
  const measurement = await params.runItemMeasurement(() =>
    loadUnitMeasurement({
      unit: params.unit,
      deadlineMs: Date.now() + params.measureTimeoutMs,
    }),
  );
  const removal: CandidateRemovalRunTool = { kind: 'runTool', unit: params.unit };
  const candidate = buildExploreCandidate({
    finding: params.finding,
    path: params.finding.displayPath,
    removal: removal,
    category: params.category,
    measurement: measurement,
  });

  return { decisions: [{ kind: 'offer', candidate: candidate }], issues: [] };
}

/**
 * Offers the unit's folder at any size with the identity it has now, which the deletion checks
 * again. A symbolic link is skipped, since only the folder itself may be deleted. A vanished,
 * unreadable, or mounted folder is handled by `loadMeasuredPhase`, as every folder offer is.
 */
function loadPathFindingPhase(params: {
  finding: ExploreFinding;
  unit: ExplorePathUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<ScanPhase> {
  return loadMeasuredPhase({
    path: params.unit.folderPath,
    measureTimeoutMs: params.measureTimeoutMs,
    runItemMeasurement: params.runItemMeasurement,
    decide: async (measurement) => {
      if (measurement.identity.kind === 'symbolicLink') {
        return { kind: 'skip', path: params.unit.folderPath, reason: 'symbolicLink' };
      }

      const removal: CandidateRemovalDeleteUnitFolder = {
        kind: 'deleteUnitFolder',
        identity: measurement.identity,
        unit: params.unit,
      };

      return {
        kind: 'offer',
        candidate: buildExploreCandidate({
          finding: params.finding,
          path: params.unit.folderPath,
          removal: removal,
          category: params.category,
          measurement: measurement,
        }),
      };
    },
  });
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
