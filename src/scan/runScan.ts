import { join, sep } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { CatalogPlatform } from '../catalog/catalogPlatform.js';
import { PROJECT_ARTIFACT_RULES } from '../catalog/projectArtifactRules.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ExplorePlatform } from '../explore/explorePlatform.js';
import { buildExploreProbePlatform } from '../explore/exploreProbe.js';
import type { ProjectPinsLoad } from '../explore/projectPins/loadProjectPins.js';
import { loadProjectPins } from '../explore/projectPins/loadProjectPins.js';
import { startExploreProbes } from '../explore/startExploreProbes.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { Result } from '../result.js';
import { createConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../system/limits.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';
import { buildFailureIssues } from './buildReadIssue.js';
import { buildScanReport } from './buildScanReport.js';
import type { SectionTotal } from './buildSectionTotals.js';
import { buildSectionTotals } from './buildSectionTotals.js';
import type { Advice, Candidate, SkipReason } from './candidate.js';
import { decideAppCandidate } from './decideAppCandidate.js';
import { decideArtifactCandidate } from './decideArtifactCandidate.js';
import {
  buildCarvedPaths,
  decideCatalogCandidate,
  isSystemOwnedTarget,
} from './decideCatalogCandidate.js';
import type { OrphanInstalledFacts } from './decideOrphanCandidate.js';
import {
  buildOrphanInstalledFacts,
  decideOrphanCandidate,
  isOrphanNameSkipReported,
  matchOrphanName,
} from './decideOrphanCandidate.js';
import { decideUserFileCandidate } from './decideUserFileCandidate.js';
import { dedupeCandidates } from './dedupeCandidates.js';
import type { CatalogTarget } from './findCatalogTargets.js';
import { findCatalogTargets } from './findCatalogTargets.js';
import { findLargeUserFiles } from './findLargeUserFiles.js';
import { findLastSignOfUse } from './findLastSignOfUse.js';
import { getCatalogEntryPath } from './getCatalogEntryPath.js';
import type { ScanIssue } from './issue.js';
import { DAY_MS, SCAN_LIMITS } from './limits.js';
import { loadExplorePhase } from './loadExplorePhase.js';
import { loadMeasuredPhase } from './loadMeasuredPhase.js';
import { buildFoundTargets, loadMeasuredTargetsPhase } from './loadMeasuredTargetsPhase.js';
import { loadTreeActivity } from './loadTreeActivity.js';
import type { OrphanLocation } from './orphanLocations.js';
import { ORPHAN_LOCATIONS } from './orphanLocations.js';
import {
  buildAppOwner,
  findOwnerAppName,
  findOwnerBundlePaths,
  resolveOwnerState,
  resolveTargetOwner,
} from './resolveOwnerState.js';
import type { ScanPhase } from './scanPhase.js';
import { mergeScanPhases } from './scanPhase.js';
import type { InstalledApp, ScanPlatform, ScanPlatformApps } from './scanPlatform.js';
import type { ArtifactFinding, ProjectWalk } from './walkProjects.js';
import { walkProjects } from './walkProjects.js';

export type ScanOptions = {
  staleDays: number;
  unusedDays: number;
};

export type SkippedItem = {
  path: string;
  reason: SkipReason;
};

/** The part of the scan running now, as a client names it. */
export type ScanProgressPhase =
  | 'apps'
  | 'catalog'
  | 'projects'
  | 'largeFiles'
  | 'leftovers'
  | 'tools';

type ScanProgressStep = { message: string; phase: ScanProgressPhase };

/** The step starting now, with what the steps before it found, deduped as the report will be. */
export type ScanProgress = ScanProgressStep & { found: SectionTotal[] };

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
  /** The scan's stale window, which scales each catalog entry's `unchangedDays`. */
  staleDays: number;
  staleCutoffMs: number;
  unusedCutoffMs: number;
  /** The running system's version, which an installer of the same release never goes for. */
  systemVersion: string | null;
  installedApps: InstalledApp[];
  /** False when an app folder or a bundle id could not be read: no container counts as orphaned. */
  isInstalledAppListComplete: boolean;
  /** `null` when `ps` failed: every item with an owner app is then withheld. */
  processCommands: string[] | null;
  activeXcodeBundlePath: Result<string | null, CommandFailure>;
  /** The system slice's entry reads, asked by every walk and measurement of the scan. */
  entryReads: EntryReads;
  /** The system slice's code of a privacy denial, for every issue of a failed read. */
  privacyDenialCode: string | null;
  /** Home folders searched for large files, from the scan slice. */
  userFileRootRelativePaths: string[];
};

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
  catalog: CatalogPlatform;
  tools: ToolsPlatform;
  scan: ScanPlatform;
  system: SystemPlatform;
  explore: ExplorePlatform;
  options: ScanOptions;
  onProgress: (progress: ScanProgress) => void;
}): Promise<ScanReport> {
  // Known from the start, so the first `found` already leaves out what a probe reserves.
  const reservedEntryPaths = params.catalog.entries.flatMap((entry) =>
    entry.removal.kind === 'explore'
      ? [getCatalogEntryPath({ environment: params.environment, entry: entry })]
      : [],
  );

  params.onProgress(
    buildScanProgress({
      step: { message: 'Checking installed apps and running processes…', phase: 'apps' },
      pathRules: params.environment.pathRules,
      reservedEntryPaths: reservedEntryPaths,
      finishedPhases: [],
    }),
  );

  const processCommandsLoad = params.system.loadRunningProcesses({
    commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });
  const knownProcessCommandsLoad = processCommandsLoad.then((result) =>
    result.kind === 'succeeded' ? result.value : null,
  );
  const activeXcodeBundlePathLoad = params.scan.loadActiveXcodeBundlePath({
    commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });
  const unusedCutoffMs = params.environment.nowMs - params.options.unusedDays * DAY_MS;
  const staleCutoffMs = params.environment.nowMs - params.options.staleDays * DAY_MS;
  // One walk serves the artifact phase and the pinned probes, its deadline counted from scan start.
  const projectWalk = walkProjects({
    pathRules: params.environment.pathRules,
    homeDir: params.environment.homeDir,
    excludedTopNames: params.scan.projectSearchExcludedNames,
    rules: PROJECT_ARTIFACT_RULES,
    maxDepth: SCAN_LIMITS.projectMaxDepth,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
    entryReads: params.system.entryReads,
    privacyDenialCode: params.system.privacyDenialCode,
  });
  const projectPins: ProjectPinsLoad = {
    walkEnded: projectWalk.then(() => undefined),
    pins: projectWalk.then((walk) =>
      loadProjectPins({
        pathRules: params.environment.pathRules,
        homeDir: params.environment.homeDir,
        walkedPinFiles: walk.pinFiles,
        isWalkComplete: walk.isComplete,
        privacyDenialCode: params.system.privacyDenialCode,
      }),
    ),
  };
  // The probes run beside every phase; the Explore phase waits for them last.
  const probes = startExploreProbes({
    environment: params.environment,
    platform: buildExploreProbePlatform({
      explore: params.explore,
      tools: params.tools,
      system: params.system,
    }),
    toolInstallLocations: params.tools.installLocations,
    processCommands: knownProcessCommandsLoad,
    // A failed `xcode-select` counts as no active Xcode, so the simulator probe runs nothing.
    activeXcodeBundlePath: activeXcodeBundlePathLoad.then((result) =>
      result.kind === 'succeeded' ? result.value : null,
    ),
    timeoutMs: SCAN_LIMITS.toolProbeTimeoutMs,
    unusedCutoffMs: unusedCutoffMs,
    staleCutoffMs: staleCutoffMs,
    projectPins: projectPins,
  });
  const [processCommands, installed, activeXcodeBundlePath, systemVersion] = await Promise.all([
    processCommandsLoad,
    loadPlatformApps({ apps: params.scan.apps, appDirs: params.environment.applicationDirs }),
    activeXcodeBundlePathLoad,
    params.system.loadSystemVersion(),
  ]);
  const context: ScanContext = {
    environment: params.environment,
    staleDays: params.options.staleDays,
    staleCutoffMs: staleCutoffMs,
    unusedCutoffMs: unusedCutoffMs,
    systemVersion: systemVersion,
    installedApps: installed.apps,
    isInstalledAppListComplete: installed.issues.length === 0,
    processCommands: await knownProcessCommandsLoad,
    activeXcodeBundlePath: activeXcodeBundlePath,
    entryReads: params.system.entryReads,
    privacyDenialCode: params.system.privacyDenialCode,
    userFileRootRelativePaths: params.scan.userFileRootRelativePaths,
  };
  const setup: ScanPhase = {
    decisions: [],
    issues: [
      ...buildCommandIssues({ results: [processCommands, activeXcodeBundlePath] }),
      ...installed.issues,
    ],
  };

  params.onProgress(
    buildScanProgress({
      step: { message: 'Measuring known storage locations…', phase: 'catalog' },
      pathRules: params.environment.pathRules,
      reservedEntryPaths: reservedEntryPaths,
      finishedPhases: [setup],
    }),
  );
  const catalog = await loadCatalogPhase({
    context: context,
    entries: params.catalog.entries.filter((entry) => entry.removal.kind !== 'explore'),
  });

  params.onProgress(
    buildScanProgress({
      step: { message: 'Searching your projects for old build folders…', phase: 'projects' },
      pathRules: params.environment.pathRules,
      reservedEntryPaths: reservedEntryPaths,
      finishedPhases: [setup, catalog],
    }),
  );
  const artifacts = await loadArtifactPhase({ context: context, projectWalk: projectWalk });

  const apps = await loadAppPhaseOfAppSection({
    apps: params.scan.apps,
    context: context,
    onStep: (step) =>
      params.onProgress(
        buildScanProgress({
          step: step,
          pathRules: params.environment.pathRules,
          reservedEntryPaths: reservedEntryPaths,
          finishedPhases: [setup, catalog, artifacts],
        }),
      ),
  });

  params.onProgress(
    buildScanProgress({
      step: { message: 'Looking for large old files…', phase: 'largeFiles' },
      pathRules: params.environment.pathRules,
      reservedEntryPaths: reservedEntryPaths,
      finishedPhases: [setup, catalog, artifacts, apps],
    }),
  );
  const userFiles = await loadUserFilePhase({ context: context });

  const orphans = await loadOrphanPhaseOfAppSection({
    apps: params.scan.apps,
    context: context,
    onStep: (step) =>
      params.onProgress(
        buildScanProgress({
          step: step,
          pathRules: params.environment.pathRules,
          reservedEntryPaths: reservedEntryPaths,
          finishedPhases: [setup, catalog, artifacts, apps, userFiles],
        }),
      ),
  });

  params.onProgress(
    buildScanProgress({
      step: { message: 'Asking developer tools what they can clean…', phase: 'tools' },
      pathRules: params.environment.pathRules,
      reservedEntryPaths: reservedEntryPaths,
      finishedPhases: [setup, catalog, artifacts, apps, userFiles, orphans],
    }),
  );
  const explore = await loadExplorePhase({
    environment: params.environment,
    probes: probes,
    catalogEntries: params.catalog.entries,
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
    entryReads: params.system.entryReads,
    privacyDenialCode: params.system.privacyDenialCode,
  });
  const exploreAdvice = await loadCatalogPhase({
    context: context,
    entries: explore.fallbackEntries,
  });
  const incompleteExploreAdvice = await loadCatalogPhase({
    context: context,
    entries: explore.incompleteEntries,
  });

  return buildScanReportOfPhases({
    pathRules: params.environment.pathRules,
    reservedEntryPaths: reservedEntryPaths,
    // Explore comes last, so an item an earlier source found wins the overlap.
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
    incompleteExploreAdvice: incompleteExploreAdvice,
  });
}

/** The platform's installed apps, read from the environment's app folders as its app section says. */
function loadPlatformApps(params: {
  apps: ScanPlatformApps;
  appDirs: AbsolutePath[];
}): Promise<{ apps: InstalledApp[]; issues: ScanIssue[] }> {
  switch (params.apps.appSection) {
    case 'offerUnusedApps':
      return params.apps.loadInstalledApps({
        appDirs: params.appDirs,
        commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
      });
  }
}

/** The installed apps measured and judged, as the platform's app section says. */
function loadAppPhaseOfAppSection(params: {
  apps: ScanPlatformApps;
  context: ScanContext;
  onStep: (step: ScanProgressStep) => void;
}): Promise<ScanPhase> {
  switch (params.apps.appSection) {
    case 'offerUnusedApps':
      params.onStep({ message: 'Measuring apps…', phase: 'apps' });

      return loadAppPhase({ context: params.context });
  }
}

/** The data left by removed apps, as the platform's app section says. */
function loadOrphanPhaseOfAppSection(params: {
  apps: ScanPlatformApps;
  context: ScanContext;
  onStep: (step: ScanProgressStep) => void;
}): Promise<ScanPhase> {
  switch (params.apps.appSection) {
    case 'offerUnusedApps':
      params.onStep({ message: 'Looking for data of removed apps…', phase: 'leftovers' });

      return loadOrphanPhase({ context: params.context });
  }
}

/** Dedupes what the finished phases found the same way the report does, so no total shrinks. */
function buildScanProgress(params: {
  step: ScanProgressStep;
  pathRules: PathRules;
  reservedEntryPaths: string[];
  finishedPhases: ScanPhase[];
}): ScanProgress {
  const decisions = dedupeCandidates({
    pathRules: params.pathRules,
    decisions: mergeScanPhases({ phases: params.finishedPhases }).decisions,
    reservedEntryPaths: params.reservedEntryPaths,
  });

  return {
    message: params.step.message,
    phase: params.step.phase,
    found: buildSectionTotals({
      candidates: decisions.flatMap((decision) =>
        decision.kind === 'offer' ? [decision.candidate] : [],
      ),
      advice: decisions.flatMap((decision) =>
        decision.kind === 'advice' ? [decision.advice] : [],
      ),
    }),
  };
}

/**
 * Dedupes the decisions of the phases, in their order, with the paths of the Explore entries
 * reserved for their probes, then adds the advice of the Explore entries whose probe judged only
 * part of their units, and builds the report.
 */
export function buildScanReportOfPhases(params: {
  pathRules: PathRules;
  reservedEntryPaths: string[];
  phases: ScanPhase[];
  incompleteExploreAdvice: ScanPhase;
}): ScanReport {
  const scan = mergeScanPhases({ phases: params.phases });

  return buildScanReport({
    decisions: [
      ...dedupeCandidates({
        pathRules: params.pathRules,
        decisions: scan.decisions,
        reservedEntryPaths: params.reservedEntryPaths,
      }),
      // Added after the dedupe, so this advice holds back no offer of its own entry, whose units
      // lie inside its path. Moved before it, the advice would skip every finding of its probe.
      ...params.incompleteExploreAdvice.decisions,
    ],
    issues: [...scan.issues, ...params.incompleteExploreAdvice.issues],
  });
}

async function loadCatalogPhase(params: {
  context: ScanContext;
  entries: CatalogEntry[];
}): Promise<ScanPhase> {
  const found = await findCatalogTargets({
    environment: params.context.environment,
    entries: params.entries,
    privacyDenialCode: params.context.privacyDenialCode,
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
  const owner = resolveTargetOwner({
    entry: entry,
    path: path,
    installedApps: params.context.installedApps,
  });

  // Decided before measuring, because macOS denies reading most of its own folders.
  if (isSystemOwnedTarget({ entry: entry, owner: owner })) {
    return { decisions: [{ kind: 'skip', path: path, reason: 'systemOwned' }], issues: [] };
  }

  const pathRules = params.context.environment.pathRules;
  const carvedPaths = buildCarvedPaths({ pathRules: pathRules, entry: entry, path: path });

  return loadMeasuredTargetsPhase({
    found: buildFoundTargets(params.target.targetPaths),
    carve: carvedPaths.length === 0 ? null : { pathRules: pathRules, carvedPaths: carvedPaths },
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
    entryReads: params.context.entryReads,
    privacyDenialCode: params.context.privacyDenialCode,
    decide: async (measurement) => {
      const activity =
        entry.ageRule.kind === 'unchangedDays'
          ? await loadTreeActivity({
              path: path,
              cutoffMs: getUnchangedCutoffMs({
                nowMs: params.context.environment.nowMs,
                days: entry.ageRule.days,
                staleDays: params.context.staleDays,
              }),
              excludedNames: [],
              maxEntries: SCAN_LIMITS.probeMaxEntries,
              deadlineMs: Date.now() + SCAN_LIMITS.probeTimeoutMs,
              entryReads: params.context.entryReads,
            })
          : null;

      return decideCatalogCandidate({
        entry: entry,
        path: path,
        measurement: measurement,
        owner: owner,
        ownerBundlePaths: findOwnerBundlePaths({
          owner: owner,
          installedApps: params.context.installedApps,
        }),
        ownerState: resolveOwnerState({
          owner: owner,
          installedApps: params.context.installedApps,
          processCommands: params.context.processCommands,
        }),
        ownerAppName: findOwnerAppName({
          owner: owner,
          installedApps: params.context.installedApps,
        }),
        activity: activity,
        minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
        carvedPaths: carvedPaths,
      });
    },
  });
}

/**
 * The cutoff of an `unchangedDays` entry: its `days` under the default stale window, scaled by the
 * scan's own, so an entry of the default window keeps exactly the scan's stale cutoff.
 */
function getUnchangedCutoffMs(params: { nowMs: number; days: number; staleDays: number }): number {
  return params.nowMs - (params.days * params.staleDays * DAY_MS) / SCAN_LIMITS.defaultStaleDays;
}

async function loadArtifactPhase(params: {
  context: ScanContext;
  projectWalk: Promise<ProjectWalk>;
}): Promise<ScanPhase> {
  const found = await params.projectWalk;
  const findingPhases = await Promise.all(
    found.artifacts.map((finding) =>
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
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
    entryReads: params.context.entryReads,
    privacyDenialCode: params.context.privacyDenialCode,
    decide: async (measurement) => {
      const activity = await loadTreeActivity({
        path: params.finding.projectRoot,
        cutoffMs: params.context.staleCutoffMs,
        excludedNames: PROJECT_ACTIVITY_EXCLUDED_NAMES,
        maxEntries: SCAN_LIMITS.probeMaxEntries,
        deadlineMs: Date.now() + SCAN_LIMITS.probeTimeoutMs,
        entryReads: params.context.entryReads,
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
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
    entryReads: params.context.entryReads,
    privacyDenialCode: params.context.privacyDenialCode,
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
          owner: buildAppOwner({ app: app }),
          installedApps: params.context.installedApps,
          processCommands: params.context.processCommands,
        }),
        isProtectedDeveloperApp: isProtectedDeveloperApp({
          app: app,
          appRealPath: measurement.identity.realPath,
          activeXcodeBundlePath: params.context.activeXcodeBundlePath,
        }),
        minAppBytes: SCAN_LIMITS.minAppBytes,
        systemVersion: params.context.systemVersion,
        nowMs: params.context.environment.nowMs,
        user: params.context.environment.user,
      });
    },
  });
}

async function loadUserFilePhase(params: { context: ScanContext }): Promise<ScanPhase> {
  const found = await findLargeUserFiles({
    rootDirs: params.context.userFileRootRelativePaths.map((relativePath) =>
      join(params.context.environment.homeDir, relativePath),
    ),
    minAllocatedBytes: SCAN_LIMITS.minUserFileBytes,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
    entryReads: params.context.entryReads,
    privacyDenialCode: params.context.privacyDenialCode,
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
  const installed = buildOrphanInstalledFacts({
    apps: params.context.installedApps,
    applicationDirs: params.context.environment.applicationDirs,
    isComplete: params.context.isInstalledAppListComplete,
  });
  const locationPhases = await Promise.all(
    ORPHAN_LOCATIONS.map((location) =>
      loadOrphanLocationPhase({
        context: params.context,
        location: location,
        installed: installed,
      }),
    ),
  );

  return mergeScanPhases({ phases: locationPhases });
}

/** The folders of one location that may be the data of a removed app; a missing one has none. */
async function loadOrphanLocationPhase(params: {
  context: ScanContext;
  location: OrphanLocation;
  installed: OrphanInstalledFacts;
}): Promise<ScanPhase> {
  const locationPath = join(params.context.environment.homeDir, ...params.location.pathNames);
  const names = await loadDirectoryNames({ path: locationPath });

  if (names.kind === 'failed') {
    return {
      decisions: [],
      issues: buildFailureIssues({
        path: locationPath,
        failure: names.failure,
        privacyDenialCode: params.context.privacyDenialCode,
      }),
    };
  }

  const namePhases = await Promise.all(
    names.value.map((name) => {
      const path = join(locationPath, name);
      const nameMatch = matchOrphanName({
        name: name,
        location: params.location,
        installed: params.installed,
      });

      if (nameMatch.kind === 'skip') {
        const isReported = isOrphanNameSkipReported({
          reason: nameMatch.reason,
          location: params.location,
        });
        const skipPhase: ScanPhase = {
          decisions: isReported ? [{ kind: 'skip', path: path, reason: nameMatch.reason }] : [],
          issues: [],
        };

        return Promise.resolve(skipPhase);
      }

      return loadMeasuredPhase({
        path: path,
        measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
        runItemMeasurement: runItemMeasurement,
        entryReads: params.context.entryReads,
        privacyDenialCode: params.context.privacyDenialCode,
        decide: async (measurement) =>
          decideOrphanCandidate({
            path: path,
            name: name,
            matchedBy: nameMatch.matchedBy,
            location: params.location,
            measurement: measurement,
            unusedCutoffMs: params.context.unusedCutoffMs,
            minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
          }),
      });
    }),
  );

  return mergeScanPhases({ phases: namePhases });
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
