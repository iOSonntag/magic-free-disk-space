import type { CandidateCategory, CatalogEntry, ExploreProbeId } from '../catalog/catalog.js';
import type { ExploreFinding, ExploreUnit } from '../explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../explore/startExploreProbes.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { CandidateDecision, CandidateProbed, CandidateRemovalRunTool } from './candidate.js';
import type { ScanIssue } from './issue.js';
import type { UnitMeasurement } from './loadUnitMeasurement.js';
import { loadUnitMeasurement } from './loadUnitMeasurement.js';

/**
 * The decisions of the probes that ran, and the entries whose probe did not run, which the scan
 * decides through its catalog path as advice.
 */
export type ExplorePhase = {
  decisions: CandidateDecision[];
  issues: ScanIssue[];
  fallbackEntries: CatalogEntry[];
};

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
      const decisions = await Promise.all(
        outcome.findings.map((finding) =>
          loadExploreFindingDecision({
            finding: finding,
            category: params.entry.category,
            measureTimeoutMs: params.measureTimeoutMs,
            runItemMeasurement: params.runItemMeasurement,
          }),
        ),
      );

      return { decisions: decisions, issues: [], fallbackEntries: [] };
    }
    case 'toolMissing':
      return { decisions: [], issues: [], fallbackEntries: [params.entry] };
    case 'toolUntrusted':
      return {
        decisions: [],
        issues: [
          { path: outcome.failure.path, reason: 'toolUntrusted', detail: outcome.failure.detail },
        ],
        fallbackEntries: [params.entry],
      };
    case 'failed':
      return {
        decisions: [],
        issues: [{ path: outcome.tool.path, reason: 'toolFailed', failure: outcome.failure }],
        fallbackEntries: [params.entry],
      };
    case 'unreadable':
      throw new Error('The issue of an unreadable probe file is not built yet (part 2B3)');
  }
}

/**
 * Skips a busy finding as `ownerRunning` and one whose activity is unknown as `runningUnknown`,
 * both unmeasured; offers an idle one at any size.
 */
async function loadExploreFindingDecision(params: {
  finding: ExploreFinding;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<CandidateDecision> {
  switch (params.finding.activity) {
    case 'busy':
      return { kind: 'skip', path: params.finding.displayPath, reason: 'ownerRunning' };
    case 'unknown':
      return { kind: 'skip', path: params.finding.displayPath, reason: 'runningUnknown' };
    case 'idle':
      return loadIdleFindingOffer(params);
  }
}

/** Measures the finding's paths and offers it at any size. */
async function loadIdleFindingOffer(params: {
  finding: ExploreFinding;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
}): Promise<CandidateDecision> {
  const measurement = await params.runItemMeasurement(() =>
    loadUnitMeasurement({
      unit: params.finding.unit,
      deadlineMs: Date.now() + params.measureTimeoutMs,
    }),
  );

  return {
    kind: 'offer',
    candidate: buildExploreCandidate({
      finding: params.finding,
      category: params.category,
      measurement: measurement,
    }),
  };
}

function buildExploreCandidate(params: {
  finding: ExploreFinding;
  category: CandidateCategory;
  measurement: UnitMeasurement;
}): CandidateProbed {
  return {
    path: params.finding.displayPath,
    title: params.finding.title,
    category: params.category,
    risk: params.finding.risk,
    origin: 'explore',
    explanation: params.finding.explanation,
    regeneration: params.finding.regeneration,
    allocatedBytes: params.measurement.allocatedBytes,
    entryCount: params.measurement.entryCount,
    isComplete: params.measurement.isComplete,
    removal: buildExploreRemoval(params.finding.unit),
    evidenceLines: params.finding.evidenceLines,
  };
}

function buildExploreRemoval(unit: ExploreUnit): CandidateRemovalRunTool {
  switch (unit.kind) {
    case 'simulatorDevice':
    case 'dartPubCache':
    case 'miseVersion':
    case 'simulatorRuntime':
    case 'androidAvd':
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
      return { kind: 'runTool', unit: unit };
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
      throw new Error('The removal of a path unit is not built yet (part 2B3)');
  }
}
