import { join, sep } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import { PROJECT_ARTIFACT_RULES } from '../catalog/projectArtifactRules.js';
import type { Environment } from '../environment/buildEnvironment.js';
import { startExploreProbes } from '../explore/startExploreProbes.js';
import type { Result } from '../result.js';
import { createConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import type { ToolInstallLocations } from '../tools/toolInstallLocations.js';
import { buildInstalledBundleIds } from './buildInstalledBundleIds.js';
import { buildScanReport } from './buildScanReport.js';
import type { Advice, Candidate, CandidateDecision, SkipReason } from './candidate.js';
import { decideAppCandidate } from './decideAppCandidate.js';
import { decideArtifactCandidate } from './decideArtifactCandidate.js';
import { decideCatalogCandidate, isSystemOwnedTarget } from './decideCatalogCandidate.js';
import { decideOrphanCandidate, getOrphanNameSkipReason } from './decideOrphanCandidate.js';
import { decideUserFileCandidate } from './decideUserFileCandidate.js';
import { dedupeCandidates } from './dedupeCandidates.js';
import type { CatalogTarget } from './findCatalogTargets.js';
import { findCatalogTargets } from './findCatalogTargets.js';
import { findLargeUserFiles } from './findLargeUserFiles.js';
import { findLastSignOfUse } from './findLastSignOfUse.js';
import type { ArtifactFinding } from './findProjectArtifacts.js';
import { findProjectArtifacts } from './findProjectArtifacts.js';
import type { ScanIssue } from './issue.js';
import {
  DAY_MS,
  PROJECT_SEARCH_EXCLUDED_NAMES,
  SCAN_LIMITS,
  USER_FILE_ROOT_RELATIVE_PATHS,
} from './limits.js';
import { loadActiveXcodeBundlePath } from './loadActiveXcodeBundlePath.js';
import { loadExplorePhase } from './loadExplorePhase.js';
import type { InstalledApp } from './loadInstalledApps.js';
import { loadInstalledApps } from './loadInstalledApps.js';
import type { Measurement } from './loadPathMeasurement.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';
import { loadProcessCommands } from './loadProcessCommands.js';
import { loadTreeActivity } from './loadTreeActivity.js';
import {
  findOwnerBundlePaths,
  resolveOwnerBundleId,
  resolveOwnerState,
} from './resolveOwnerState.js';
import { skipOfferHoldingOtherVolume } from './skipOfferHoldingOtherVolume.js';

export type ScanOptions = {
  staleDays: number;
  unusedDays: number;
};

export type SkippedItem = {
  path: string;
  reason: SkipReason;
};

export type ScanReport = {
  /**
   * Ranked by allocated bytes, Explore items after all others. The number of an item is its
   * index plus one.
   */
  candidates: Candidate[];
  /** The numbers "Select safe" and the `safe` token pick: safe items outside Explore. */
  safeNumbers: number[];
  advice: Advice[];
  skipped: SkippedItem[];
  issues: ScanIssue[];
};

type ScanContext = {
  environment: Environment;
  staleCutoffMs: number;
  unusedCutoffMs: number;
  installedApps: InstalledApp[];
  /** False when an app folder or a bundle id could not be read: no container counts as orphaned. */
  isInstalledAppListComplete: boolean;
  /** `null` when `ps` failed: every item with an owner app is then withheld. */
  processCommands: string[] | null;
  activeXcodeBundlePath: Result<string | null, CommandFailure>;
};

/** Decisions in source order with the issues met on the way. */
type ScanPhase = { decisions: CandidateDecision[]; issues: ScanIssue[] };

const EMPTY_PHASE: ScanPhase = { decisions: [], issues: [] };

const XCODE_BUNDLE_ID_PREFIX = 'com.apple.dt.Xcode';

/**
 * Items measured at once. Each measurement walks with its own readers, so a few at a time keep
 * the disk busy without holding thousands of half-read folders in memory.
 */
const runItemMeasurement = createConcurrencyLimit({ maxConcurrent: 4 });

/** Names whose changes say nothing about whether a project is in use. */
const PROJECT_ACTIVITY_EXCLUDED_NAMES = [
  ...new Set([...PROJECT_ARTIFACT_RULES.map((rule) => rule.artifactName), '.git']),
];

/**
 * Scans every source of leftovers and decides about each item. Reads only; it deletes nothing.
 * Sources run in a fixed order, because an earlier item wins an overlap with a later one.
 */
export async function runScan(params: {
  environment: Environment;
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
  options: ScanOptions;
  onProgress: (message: string) => void;
}): Promise<ScanReport> {
  params.onProgress('Checking installed apps and running processes…');

  const processCommandsLoad = loadProcessCommands({
    commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });
  const knownProcessCommandsLoad = processCommandsLoad.then((result) =>
    result.kind === 'succeeded' ? result.value : null,
  );
  const activeXcodeBundlePathLoad = loadActiveXcodeBundlePath({
    commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
  });
  const unusedCutoffMs = params.environment.nowMs - params.options.unusedDays * DAY_MS;
  // The probes run beside every phase; the Explore phase waits for them last.
  const probes = startExploreProbes({
    environment: params.environment,
    toolInstallLocations: params.toolInstallLocations,
    processCommands: knownProcessCommandsLoad,
    // A failed `xcode-select` counts as no active Xcode, so the simulator probe runs nothing.
    activeXcodeBundlePath: activeXcodeBundlePathLoad.then((result) =>
      result.kind === 'succeeded' ? result.value : null,
    ),
    timeoutMs: SCAN_LIMITS.toolProbeTimeoutMs,
    unusedCutoffMs: unusedCutoffMs,
  });
  const [processCommands, installed, activeXcodeBundlePath] = await Promise.all([
    processCommandsLoad,
    loadInstalledApps({
      appDirs: params.environment.applicationDirs,
      commandTimeoutMs: SCAN_LIMITS.commandTimeoutMs,
    }),
    activeXcodeBundlePathLoad,
  ]);
  const context: ScanContext = {
    environment: params.environment,
    staleCutoffMs: params.environment.nowMs - params.options.staleDays * DAY_MS,
    unusedCutoffMs: unusedCutoffMs,
    installedApps: installed.apps,
    isInstalledAppListComplete: installed.issues.length === 0,
    processCommands: await knownProcessCommandsLoad,
    activeXcodeBundlePath: activeXcodeBundlePath,
  };
  const setup: ScanPhase = {
    decisions: [],
    issues: [
      ...buildCommandIssues({ results: [processCommands, activeXcodeBundlePath] }),
      ...installed.issues,
    ],
  };

  params.onProgress('Measuring known storage locations…');
  const catalog = await loadCatalogPhase({
    context: context,
    entries: params.catalogEntries.filter((entry) => entry.removal.kind !== 'explore'),
  });

  params.onProgress('Searching your projects for old build folders…');
  const artifacts = await loadArtifactPhase({ context: context });

  params.onProgress('Measuring apps…');
  const apps = await loadAppPhase({ context: context });

  params.onProgress('Looking for large old files…');
  const userFiles = await loadUserFilePhase({ context: context });

  params.onProgress('Looking for data of removed apps…');
  const orphans = await loadOrphanPhase({ context: context });

  params.onProgress('Asking developer tools what they can clean…');
  const explore = await loadExplorePhase({
    probes: probes,
    catalogEntries: params.catalogEntries,
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
  });
  const exploreAdvice = await loadCatalogPhase({
    context: context,
    entries: explore.fallbackEntries,
  });

  // Explore comes last, so an item an earlier source found wins the overlap.
  const scan = mergeScanPhases({
    phases: [
      setup,
      catalog,
      artifacts,
      apps,
      userFiles,
      orphans,
      { decisions: explore.decisions, issues: explore.issues },
      exploreAdvice,
    ],
  });

  return buildScanReport({
    decisions: dedupeCandidates({ decisions: scan.decisions }),
    issues: scan.issues,
  });
}

async function loadCatalogPhase(params: {
  context: ScanContext;
  entries: CatalogEntry[];
}): Promise<ScanPhase> {
  const found = await findCatalogTargets({
    environment: params.context.environment,
    entries: params.entries,
  });
  const targetPhases = await Promise.all(
    found.targets.map((target) =>
      loadCatalogTargetPhase({ context: params.context, target: target }),
    ),
  );

  return mergeScanPhases({ phases: [{ decisions: [], issues: found.issues }, ...targetPhases] });
}

async function loadCatalogTargetPhase(params: {
  context: ScanContext;
  target: CatalogTarget;
}): Promise<ScanPhase> {
  const entry = params.target.entry;
  const path = params.target.path;
  const ownerBundleId = resolveOwnerBundleId({
    entry: entry,
    path: path,
    installedApps: params.context.installedApps,
  });

  // Decided before measuring, because macOS denies reading most of its own folders.
  if (isSystemOwnedTarget({ entry: entry, ownerBundleId: ownerBundleId })) {
    return { decisions: [{ kind: 'skip', path: path, reason: 'systemOwned' }], issues: [] };
  }

  return loadMeasuredPhase({
    path: path,
    decide: async (measurement) => {
      const activity =
        entry.ageRule === 'staleDays'
          ? await loadTreeActivity({
              path: path,
              cutoffMs: params.context.staleCutoffMs,
              excludedNames: [],
              maxEntries: SCAN_LIMITS.probeMaxEntries,
              deadlineMs: Date.now() + SCAN_LIMITS.probeTimeoutMs,
            })
          : null;

      return decideCatalogCandidate({
        entry: entry,
        path: path,
        measurement: measurement,
        ownerBundleId: ownerBundleId,
        ownerBundlePaths: findOwnerBundlePaths({
          ownerBundleId: ownerBundleId,
          installedApps: params.context.installedApps,
        }),
        ownerState: resolveOwnerState({
          ownerBundleId: ownerBundleId,
          installedApps: params.context.installedApps,
          processCommands: params.context.processCommands,
        }),
        activity: activity,
        minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
      });
    },
  });
}

async function loadArtifactPhase(params: { context: ScanContext }): Promise<ScanPhase> {
  const found = await findProjectArtifacts({
    homeDir: params.context.environment.homeDir,
    excludedTopNames: PROJECT_SEARCH_EXCLUDED_NAMES,
    rules: PROJECT_ARTIFACT_RULES,
    maxDepth: SCAN_LIMITS.projectMaxDepth,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
  });
  const findingPhases = await Promise.all(
    found.findings.map((finding) =>
      loadArtifactFindingPhase({ context: params.context, finding: finding }),
    ),
  );

  return mergeScanPhases({ phases: [{ decisions: [], issues: found.issues }, ...findingPhases] });
}

function loadArtifactFindingPhase(params: {
  context: ScanContext;
  finding: ArtifactFinding;
}): Promise<ScanPhase> {
  return loadMeasuredPhase({
    path: params.finding.artifactPath,
    decide: async (measurement) => {
      const activity = await loadTreeActivity({
        path: params.finding.projectRoot,
        cutoffMs: params.context.staleCutoffMs,
        excludedNames: PROJECT_ACTIVITY_EXCLUDED_NAMES,
        maxEntries: SCAN_LIMITS.probeMaxEntries,
        deadlineMs: Date.now() + SCAN_LIMITS.probeTimeoutMs,
      });

      return decideArtifactCandidate({
        finding: params.finding,
        measurement: measurement,
        activity: activity,
        minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
      });
    },
  });
}

async function loadAppPhase(params: { context: ScanContext }): Promise<ScanPhase> {
  const appPhases = await Promise.all(
    params.context.installedApps.map((app) =>
      loadAppItemPhase({ context: params.context, app: app }),
    ),
  );

  return mergeScanPhases({ phases: appPhases });
}

function loadAppItemPhase(params: { context: ScanContext; app: InstalledApp }): Promise<ScanPhase> {
  const app = params.app;

  return loadMeasuredPhase({
    path: app.bundlePath,
    decide: async (measurement) => {
      const lastSignOfUseMs =
        app.bundleId === null
          ? null
          : await findLastSignOfUse({
              homeDir: params.context.environment.homeDir,
              bundleId: app.bundleId,
              displayName: app.displayName,
            });

      return decideAppCandidate({
        app: app,
        measurement: measurement,
        lastSignOfUseMs: lastSignOfUseMs,
        unusedCutoffMs: params.context.unusedCutoffMs,
        ownerState: resolveOwnerState({
          ownerBundleId: app.bundleId,
          installedApps: params.context.installedApps,
          processCommands: params.context.processCommands,
        }),
        isProtectedDeveloperApp: isProtectedDeveloperApp({
          app: app,
          appRealPath: measurement.identity.realPath,
          activeXcodeBundlePath: params.context.activeXcodeBundlePath,
        }),
        minAppBytes: SCAN_LIMITS.minAppBytes,
      });
    },
  });
}

async function loadUserFilePhase(params: { context: ScanContext }): Promise<ScanPhase> {
  const found = await findLargeUserFiles({
    rootDirs: USER_FILE_ROOT_RELATIVE_PATHS.map((relativePath) =>
      join(params.context.environment.homeDir, relativePath),
    ),
    minAllocatedBytes: SCAN_LIMITS.minUserFileBytes,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
  });
  // A large file inside a dependency or git folder belongs to its project, not to the user.
  const decisions = found.findings
    .filter((finding) => !isInsideProjectMachinery({ path: finding.path }))
    .map((finding) =>
      decideUserFileCandidate({
        finding: finding,
        unusedCutoffMs: params.context.unusedCutoffMs,
        minUserFileBytes: SCAN_LIMITS.minUserFileBytes,
      }),
    );

  return { decisions: decisions, issues: found.issues };
}

async function loadOrphanPhase(params: { context: ScanContext }): Promise<ScanPhase> {
  const containersPath = join(params.context.environment.homeDir, 'Library/Containers');
  const names = await loadDirectoryNames({ path: containersPath });

  if (names.kind === 'failed') {
    if (names.failure.reason === 'missing' || names.failure.reason === 'notDirectory') {
      return EMPTY_PHASE;
    }

    return {
      decisions: [],
      issues: [{ path: containersPath, reason: names.failure.reason, detail: names.failure.code }],
    };
  }

  const installedBundleIds = buildInstalledBundleIds({ apps: params.context.installedApps });
  const namePhases = await Promise.all(
    names.value.map((name) => {
      const path = join(containersPath, name);
      const nameSkipReason = getOrphanNameSkipReason({
        name: name,
        installedBundleIds: installedBundleIds,
        isInstalledAppListComplete: params.context.isInstalledAppListComplete,
      });

      if (nameSkipReason !== null) {
        const skipPhase: ScanPhase = {
          decisions: [{ kind: 'skip', path: path, reason: nameSkipReason }],
          issues: [],
        };

        return Promise.resolve(skipPhase);
      }

      return loadMeasuredPhase({
        path: path,
        decide: async (measurement) =>
          decideOrphanCandidate({
            path: path,
            name: name,
            measurement: measurement,
            installedBundleIds: installedBundleIds,
            isInstalledAppListComplete: params.context.isInstalledAppListComplete,
            unusedCutoffMs: params.context.unusedCutoffMs,
            minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
          }),
      });
    }),
  );

  return mergeScanPhases({ phases: namePhases });
}

/**
 * Measures the path and decides with the measurement. A path that vanished adds nothing; one
 * that cannot be read adds an issue instead of a decision. An offer holding another mounted
 * volume becomes a skip.
 */
function loadMeasuredPhase(params: {
  path: string;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  return runItemMeasurement(async () => {
    const measured = await loadPathMeasurement({
      path: params.path,
      deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
    });

    return buildMeasuredPhase({ path: params.path, measured: measured, decide: params.decide });
  });
}

async function buildMeasuredPhase(params: {
  path: string;
  measured: Result<Measurement, FileFailure>;
  decide: (measurement: Measurement) => Promise<CandidateDecision>;
}): Promise<ScanPhase> {
  const measured = params.measured;

  if (measured.kind === 'succeeded') {
    const decision = skipOfferHoldingOtherVolume({
      decision: await params.decide(measured.value),
      measurement: measured.value,
    });

    return { decisions: [decision], issues: [] };
  }

  if (measured.failure.reason === 'missing') {
    return EMPTY_PHASE;
  }

  return {
    decisions: [],
    issues: [{ path: params.path, reason: measured.failure.reason, detail: measured.failure.code }],
  };
}

function mergeScanPhases(params: { phases: ScanPhase[] }): ScanPhase {
  return {
    decisions: params.phases.flatMap((phase) => phase.decisions),
    issues: params.phases.flatMap((phase) => phase.issues),
  };
}

/**
 * The active Xcode is protected, compared by real path, so a link such as `Xcode.app` to the
 * versioned bundle still protects it. When `xcode-select` failed, which Xcode is active is
 * unknown, so every Xcode is.
 */
function isProtectedDeveloperApp(params: {
  app: InstalledApp;
  appRealPath: string;
  activeXcodeBundlePath: Result<string | null, CommandFailure>;
}): boolean {
  if (params.activeXcodeBundlePath.kind === 'failed') {
    return params.app.bundleId?.startsWith(XCODE_BUNDLE_ID_PREFIX) ?? false;
  }

  return params.appRealPath === params.activeXcodeBundlePath.value;
}

function isInsideProjectMachinery(params: { path: string }): boolean {
  const segments = params.path.split(sep);

  return segments.some((segment) => PROJECT_ACTIVITY_EXCLUDED_NAMES.includes(segment));
}

function buildCommandIssues(params: { results: Result<unknown, CommandFailure>[] }): ScanIssue[] {
  return params.results.flatMap((result) => {
    if (result.kind === 'succeeded') {
      return [];
    }

    const issue: ScanIssue = {
      path: result.failure.command,
      reason: 'commandFailed',
      detail: result.failure.reason,
    };

    return [issue];
  });
}
