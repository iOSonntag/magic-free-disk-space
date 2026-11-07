import type { CandidateCategory, CatalogEntry, ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type {
  ExploreEngineUnit,
  ExploreEvictUnit,
  ExploreFinding,
  ExplorePathUnit,
  ExploreToolUnit,
  ExploreUnit,
} from '../explore/exploreUnit.js';
import { listUnitPaths } from '../explore/exploreUnit.js';
import type { ExploreProbeOutcome } from '../explore/startExploreProbes.js';
import type { ConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import { buildReadIssue } from './buildReadIssue.js';
import type {
  CandidateDecision,
  CandidateProbed,
  CandidateRemovalCallEngine,
  CandidateRemovalDeleteUnitPaths,
  CandidateRemovalEvictUnitFiles,
  CandidateRemovalProbed,
  CandidateRemovalRunTool,
} from './candidate.js';
import { getCatalogEntryPath } from './getCatalogEntryPath.js';
import type { ScanIssue } from './issue.js';
import {
  buildFoundTargets,
  hasSymbolicLinkTarget,
  loadMeasuredTargetsPhase,
} from './loadMeasuredTargetsPhase.js';
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
  entryReads: EntryReads;
  privacyDenialCode: string | null;
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
          probe: entry.removal.probe,
          outcome: params.probes[entry.removal.probe],
          measureTimeoutMs: params.measureTimeoutMs,
          runItemMeasurement: params.runItemMeasurement,
          entryReads: params.entryReads,
          privacyDenialCode: params.privacyDenialCode,
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
  probe: ExploreProbeId;
  outcome: Promise<ExploreProbeOutcome>;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
}): Promise<ExplorePhase> {
  const outcome = await params.outcome;

  switch (outcome.kind) {
    case 'probed': {
      const findingPhases = await Promise.all(
        outcome.findings.map((finding) =>
          loadExploreFindingPhase({
            finding: finding,
            probe: params.probe,
            category: params.entry.category,
            measureTimeoutMs: params.measureTimeoutMs,
            runItemMeasurement: params.runItemMeasurement,
            entryReads: params.entryReads,
            privacyDenialCode: params.privacyDenialCode,
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
    case 'engineFailed':
      return {
        decisions: [],
        issues: [{ path: outcome.socketPath, reason: 'engineFailed', failure: outcome.failure }],
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
  probe: ExploreProbeId;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
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
  probe: ExploreProbeId;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
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
    case 'vagrantBoxVersion':
    case 'rustupToolchain':
    case 'condaTarballs':
    case 'condaPackages':
      return loadToolFindingPhase({ ...params, unit: unit });
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
    case 'mailDownloads':
    case 'ollamaModel':
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'huggingFacePartialDownloads':
    case 'claudeTranscripts':
    case 'claudeCodeVersion':
    case 'ideVersionFolder':
    case 'lmStudioModel':
    case 'fvmVersion':
      return loadPathFindingPhase({ ...params, unit: unit });
    case 'icloudFolder':
      return loadEvictFindingPhase({ ...params, unit: unit });
    case 'engineBuildCache':
    case 'engineDanglingImages':
    case 'engineImage':
    case 'engineContainer':
    case 'engineVolume':
      return Promise.resolve(loadEngineFindingPhase({ ...params, unit: unit }));
  }
}

/**
 * Measures the unit's paths and offers it at any size, shown at the finding's place. Its tool
 * decides what it removes, so a path holding another volume does not skip it.
 */
async function loadToolFindingPhase(params: {
  finding: ExploreFinding;
  probe: ExploreProbeId;
  unit: ExploreToolUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
}): Promise<ScanPhase> {
  const measurement = await params.runItemMeasurement(() =>
    loadUnitMeasurement({
      unit: params.unit,
      deadlineMs: Date.now() + params.measureTimeoutMs,
      entryReads: params.entryReads,
    }),
  );
  const removal: CandidateRemovalRunTool = { kind: 'runTool', unit: params.unit };
  const candidate = buildExploreCandidate({
    finding: params.finding,
    probe: params.probe,
    path: params.finding.displayPath,
    removal: removal,
    category: params.category,
    measurement: measurement,
  });

  return { decisions: [{ kind: 'offer', candidate: candidate }], issues: [] };
}

/**
 * Offers the unit's paths at any size as its targets, each with the identity it has now, which
 * the deletion checks again, shown at the finding's place. A symbolic link is skipped, since only
 * the path itself may be deleted. A vanished, unreadable, or mounted path is handled by
 * `loadMeasuredTargetsPhase`, as every offer of paths is.
 */
function loadPathFindingPhase(params: {
  finding: ExploreFinding;
  probe: ExploreProbeId;
  unit: ExplorePathUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
}): Promise<ScanPhase> {
  const [firstPath, ...otherPaths] = listUnitPaths(params.unit);

  // Every path unit names at least one path; one that names none has nothing to offer.
  if (firstPath === undefined) {
    return Promise.resolve({ decisions: [], issues: [] });
  }

  return loadMeasuredTargetsPhase({
    found: buildFoundTargets([firstPath, ...otherPaths]),
    carve: null,
    measureTimeoutMs: params.measureTimeoutMs,
    runItemMeasurement: params.runItemMeasurement,
    entryReads: params.entryReads,
    privacyDenialCode: params.privacyDenialCode,
    decide: async (measurement) => {
      if (hasSymbolicLinkTarget(measurement)) {
        return { kind: 'skip', path: params.finding.displayPath, reason: 'symbolicLink' };
      }

      const removal: CandidateRemovalDeleteUnitPaths = {
        kind: 'deleteUnitPaths',
        targets: measurement.targets,
        unit: params.unit,
      };

      return {
        kind: 'offer',
        candidate: buildExploreCandidate({
          finding: params.finding,
          probe: params.probe,
          path: params.finding.displayPath,
          removal: removal,
          category: params.category,
          measurement: measurement,
        }),
      };
    },
  });
}

/**
 * Offers the unit's downloaded files at any size as its evict targets, each with the identity it
 * has now and the times its probe read, which the evict checks again. A symbolic link is skipped,
 * since the system evicts only a file.
 */
function loadEvictFindingPhase(params: {
  finding: ExploreFinding;
  probe: ExploreProbeId;
  unit: ExploreEvictUnit;
  category: CandidateCategory;
  measureTimeoutMs: number;
  runItemMeasurement: ConcurrencyLimit;
  entryReads: EntryReads;
  privacyDenialCode: string | null;
}): Promise<ScanPhase> {
  return loadMeasuredTargetsPhase({
    found: params.unit.foundFiles,
    carve: null,
    measureTimeoutMs: params.measureTimeoutMs,
    runItemMeasurement: params.runItemMeasurement,
    entryReads: params.entryReads,
    privacyDenialCode: params.privacyDenialCode,
    decide: async (measurement) => {
      if (hasSymbolicLinkTarget(measurement)) {
        return { kind: 'skip', path: params.finding.displayPath, reason: 'symbolicLink' };
      }

      const removal: CandidateRemovalEvictUnitFiles = {
        kind: 'evictUnitFiles',
        targets: measurement.targets,
        unit: params.unit,
      };

      return {
        kind: 'offer',
        candidate: buildExploreCandidate({
          finding: params.finding,
          probe: params.probe,
          path: params.finding.displayPath,
          removal: removal,
          category: params.category,
          measurement: measurement,
        }),
      };
    },
  });
}

/**
 * Offers an engine's unit at the size its engine reports, shown at the engine's disk image, the
 * one place on the host it takes space in. Nothing on the host is measured: the engine frees it.
 */
function loadEngineFindingPhase(params: {
  finding: ExploreFinding;
  probe: ExploreProbeId;
  unit: ExploreEngineUnit;
  category: CandidateCategory;
}): ScanPhase {
  const removal: CandidateRemovalCallEngine = { kind: 'callEngine', unit: params.unit };
  const candidate = buildExploreCandidate({
    finding: params.finding,
    probe: params.probe,
    path: params.unit.diskImagePath,
    removal: removal,
    category: params.category,
    measurement: {
      allocatedBytes: params.unit.sizeBytes,
      entryCount: 0,
      isComplete: true,
      privateSizeFallbackCount: 0,
    },
  });

  return { decisions: [{ kind: 'offer', candidate: candidate }], issues: [] };
}

function buildExploreCandidate(params: {
  finding: ExploreFinding;
  probe: ExploreProbeId;
  path: string;
  removal: CandidateRemovalProbed;
  category: CandidateCategory;
  measurement: Pick<
    UnitMeasurement,
    'allocatedBytes' | 'entryCount' | 'isComplete' | 'privateSizeFallbackCount'
  >;
}): CandidateProbed {
  return {
    path: params.path,
    title: params.finding.title,
    category: params.category,
    risk: params.finding.risk,
    origin: { kind: 'explore', probe: params.probe },
    explanation: params.finding.explanation,
    regeneration: params.finding.regeneration,
    allocatedBytes: params.measurement.allocatedBytes,
    entryCount: params.measurement.entryCount,
    isComplete: params.measurement.isComplete,
    privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
    lastUsedAtMs: getUnitLastUsedAtMs({ unit: params.finding.unit }),
    downloadedAtMs: getUnitDownloadedAtMs({ unit: params.finding.unit }),
    appName: null,
    removal: params.removal,
    evidenceLines: params.finding.evidenceLines,
  };
}

/** When the unit's tool finished its download; `null` for a unit whose probe reads none. */
function getUnitDownloadedAtMs(params: { unit: ExploreUnit }): number | null {
  switch (params.unit.kind) {
    case 'ollamaModel':
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'lmStudioModel':
      return params.unit.downloadedAtMs;
    case 'simulatorRuntime':
    case 'androidAvd':
    case 'simulatorDevice':
    case 'dartPubCache':
    case 'miseVersion':
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
    case 'asdfVersion':
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
    case 'vagrantBoxVersion':
    case 'rustupToolchain':
    case 'condaTarballs':
    case 'condaPackages':
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
    case 'mailDownloads':
    case 'huggingFacePartialDownloads':
    case 'claudeTranscripts':
    case 'claudeCodeVersion':
    case 'ideVersionFolder':
    case 'fvmVersion':
    case 'icloudFolder':
    case 'engineBuildCache':
    case 'engineDanglingImages':
    case 'engineImage':
    case 'engineContainer':
    case 'engineVolume':
      return null;
  }
}

/** The last use its own tool records for a unit; `null` for a unit whose tool records none. */
function getUnitLastUsedAtMs(params: { unit: ExploreUnit }): number | null {
  switch (params.unit.kind) {
    case 'simulatorRuntime':
    case 'androidAvd':
      return params.unit.lastUsedAtMs;
    case 'simulatorDevice':
    case 'dartPubCache':
    case 'miseVersion':
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
    case 'asdfVersion':
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
    case 'vagrantBoxVersion':
    case 'rustupToolchain':
    case 'condaTarballs':
    case 'condaPackages':
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
    case 'mailDownloads':
    case 'ollamaModel':
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'huggingFacePartialDownloads':
    case 'claudeTranscripts':
    case 'claudeCodeVersion':
    case 'ideVersionFolder':
    case 'lmStudioModel':
    case 'fvmVersion':
    case 'icloudFolder':
    case 'engineBuildCache':
    case 'engineDanglingImages':
    case 'engineImage':
    case 'engineContainer':
    case 'engineVolume':
      return null;
  }
}
