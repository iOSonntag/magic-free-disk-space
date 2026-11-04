import { join } from 'node:path';
import type { CatalogEntry } from '../catalog/catalog.js';
import type { CatalogPlatform } from '../catalog/catalogPlatform.js';
import type { ProjectArtifactRule } from '../catalog/projectArtifactRules.js';
import { resolveCatalogLocation } from '../catalog/resolveCatalogLocation.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ExplorePlatform, IdeVersionRoots } from '../explore/explorePlatform.js';
import { buildExploreProbePlatform } from '../explore/exploreProbe.js';
import type { ProjectPinsLoad } from '../explore/projectPins/loadProjectPins.js';
import { loadProjectPins } from '../explore/projectPins/loadProjectPins.js';
import { startExploreProbes } from '../explore/startExploreProbes.js';
import { isOverlappingPath } from '../path/isOverlappingPath.js';
import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { Result } from '../result.js';
import { createConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads, EvictionCandidate } from '../system/entryReads.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../system/limits.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { mapNonEmpty } from '../system/nonEmptyList.js';
import type { RunningProcessesFailure, SystemPlatform } from '../system/systemPlatform.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';
import { buildFailureIssues } from './buildReadIssue.js';
import { buildScanReport } from './buildScanReport.js';
import type { SectionTotal } from './buildSectionTotals.js';
import { buildSectionTotals } from './buildSectionTotals.js';
import type { Advice, Candidate, CandidateDecision, SkipReason } from './candidate.js';
import { isProbedCandidate } from './candidate.js';
import { decideAppAdvice } from './decideAppAdvice.js';
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
import { decideRecycleBinCandidate } from './decideRecycleBinCandidate.js';
import { decideUserFileCandidate } from './decideUserFileCandidate.js';
import { dedupeCandidates } from './dedupeCandidates.js';
import type { CatalogTarget } from './findCatalogTargets.js';
import { findCatalogTargets } from './findCatalogTargets.js';
import { findLargeUserFiles } from './findLargeUserFiles.js';
import { findLastSignOfUse } from './findLastSignOfUse.js';
import type { ScanIssue } from './issue.js';
import { DAY_MS, SCAN_LIMITS } from './limits.js';
import { listCandidateFootprint } from './listCandidateFootprint.js';
import { loadExplorePhase } from './loadExplorePhase.js';
import { loadMeasuredPhase } from './loadMeasuredPhase.js';
import { loadMeasuredTargetsPhase } from './loadMeasuredTargetsPhase.js';
import { loadTreeActivity } from './loadTreeActivity.js';
import {
  buildAppOwner,
  findOwnerAppName,
  findRemovalOwner,
  isOwnerUninstalled,
  resolveOwnerState,
  resolveTargetOwner,
} from './resolveOwnerState.js';
import { resolveUserFileRootPaths } from './resolveUserFileRootPaths.js';
import type { ScanPhase } from './scanPhase.js';
import { mergeScanPhases } from './scanPhase.js';
import type {
  AdvisedApp,
  InstalledApp,
  OrphanLocation,
  ScanPlatform,
  ScanPlatformApps,
  ScanPlatformAppsOffered,
  ScanPlatformTrash,
  SystemApp,
} from './scanPlatform.js';
import { skipOffersTheRemovalRefuses } from './skipOffersTheRemovalRefuses.js';
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
  /**
   * The installed apps of a platform whose apps are advice only, for the user to uninstall the way
   * the system does; empty on a platform that offers its apps.
   */
  appAdvice: AdvisedApp[];
  skipped: SkippedItem[];
  /**
   * The entries the scan's walks left unread because their content lives only in the cloud store,
   * each path counted once.
   */
  evictedEntryCount: number;
  issues: ScanIssue[];
};

/** The apps the platform's app section lists: offered apps, or apps the scan only advises about. */
type PlatformApps = {
  installedApps: InstalledApp[];
  advisedApps: AdvisedApp[];
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
  /** Asked only for the bundles of an owner, never listed or judged as apps. */
  systemApps: SystemApp[];
  /**
   * The running processes as the system slice lists them; `null` when the listing failed: every
   * item with an owner app is then withheld.
   */
  processCommands: string[] | null;
  activeXcodeBundlePath: Result<string | null, CommandFailure>;
  /**
   * The system slice's entry reads, asked by every walk and measurement of the scan, whose
   * eviction check records each entry it answers true for.
   */
  entryReads: EntryReads;
  /** The system slice's code of a privacy denial, for every issue of a failed read. */
  privacyDenialCode: string | null;
  /** The folders searched for large files, from the scan slice. */
  userFileRootPaths: AbsolutePath[];
};

/**
 * Items measured at once. Each measurement walks with its own readers, so a few at a time keep
 * the disk busy without holding thousands of half-read folders in memory.
 */
const runItemMeasurement = createConcurrencyLimit({ maxConcurrent: 4 });

/**
 * Names whose changes at any depth say nothing about whether a project is in use; its artifact
 * folders are left out by the paths the project walk found.
 */
const PROJECT_ACTIVITY_EXCLUDED_NAMES = ['.git'];

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
      ? [resolveCatalogLocation({ environment: params.environment, location: entry })]
      : [],
  );
  // The probe of the IDE versions takes folders outside its entry, in the roots of every version.
  const knownClaimPaths = [
    ...reservedEntryPaths,
    ...listIdeVersionRootPaths({
      environment: params.environment,
      roots: params.explore.ideVersionRoots,
    }),
  ];

  function reportProgress(progress: {
    step: ScanProgressStep;
    finishedPhases: ScanPhase[];
    probeClaimPaths: string[];
  }): void {
    params.onProgress(
      buildScanProgress({
        step: progress.step,
        environment: params.environment,
        reservedEntryPaths: reservedEntryPaths,
        probeClaimPaths: progress.probeClaimPaths,
        finishedPhases: progress.finishedPhases,
      }),
    );
  }

  reportProgress({
    step: { message: 'Checking installed apps and running processes…', phase: 'apps' },
    finishedPhases: [],
    probeClaimPaths: knownClaimPaths,
  });

  const evictedEntryPaths = new Set<string>();
  const entryReads = recordEvictedEntries({
    entryReads: params.system.entryReads,
    evictedPaths: evictedEntryPaths,
  });
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
    rules: params.scan.projectArtifactRules,
    maxDepth: SCAN_LIMITS.projectMaxDepth,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
    entryReads: entryReads,
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
    installedApps: installed.installedApps,
    isInstalledAppListComplete: installed.issues.length === 0,
    systemApps: params.scan.systemApps,
    processCommands: await knownProcessCommandsLoad,
    activeXcodeBundlePath: activeXcodeBundlePath,
    entryReads: entryReads,
    privacyDenialCode: params.system.privacyDenialCode,
    userFileRootPaths: resolveUserFileRootPaths({
      environment: params.environment,
      roots: params.scan.userFileRoots,
    }),
  };
  const setup: ScanPhase = {
    decisions: [],
    issues: [
      ...buildCommandIssues({ results: [processCommands, activeXcodeBundlePath] }),
      ...installed.issues,
    ],
  };

  reportProgress({
    step: { message: 'Measuring known storage locations…', phase: 'catalog' },
    finishedPhases: [setup],
    probeClaimPaths: knownClaimPaths,
  });
  const catalog = await loadCatalogPhase({
    context: context,
    entries: params.catalog.entries.filter((entry) => entry.removal.kind !== 'explore'),
  });
  const trash = await loadTrashPhase({
    trash: params.scan.trash,
    context: context,
    onStep: (step) =>
      reportProgress({
        step: step,
        finishedPhases: [setup, catalog],
        probeClaimPaths: knownClaimPaths,
      }),
  });

  reportProgress({
    step: { message: 'Searching your projects for old build folders…', phase: 'projects' },
    finishedPhases: [setup, catalog, trash],
    probeClaimPaths: knownClaimPaths,
  });
  // The roots the probes name, such as a project's `sdk.dir`, are known once the project walk
  // ends; they claim before the large files, which may lie in one, can count.
  const [artifacts, exploreClaimRoots] = await Promise.all([
    loadArtifactPhase({ context: context, projectWalk: projectWalk }),
    probes.claimRootsLoad,
  ]);
  const probeClaimPaths = [...knownClaimPaths, ...exploreClaimRoots];

  const apps = await loadAppPhaseOfAppSection({
    apps: params.scan.apps,
    context: context,
    onStep: (step) =>
      reportProgress({
        step: step,
        finishedPhases: [setup, catalog, trash, artifacts],
        probeClaimPaths: probeClaimPaths,
      }),
  });

  reportProgress({
    step: { message: 'Looking for large old files…', phase: 'largeFiles' },
    finishedPhases: [setup, catalog, trash, artifacts, apps],
    probeClaimPaths: probeClaimPaths,
  });
  const userFiles = await loadUserFilePhase({
    context: context,
    artifactRules: params.scan.projectArtifactRules,
  });

  const orphans = await loadOrphanPhaseOfAppSection({
    apps: params.scan.apps,
    context: context,
    onStep: (step) =>
      reportProgress({
        step: step,
        finishedPhases: [setup, catalog, trash, artifacts, apps, userFiles],
        probeClaimPaths: probeClaimPaths,
      }),
  });

  reportProgress({
    step: { message: 'Asking developer tools what they can clean…', phase: 'tools' },
    finishedPhases: [setup, catalog, trash, artifacts, apps, userFiles, orphans],
    probeClaimPaths: probeClaimPaths,
  });
  const explore = await loadExplorePhase({
    environment: params.environment,
    probes: probes.outcomes,
    catalogEntries: params.catalog.entries,
    measureTimeoutMs: SCAN_LIMITS.measureTimeoutMs,
    runItemMeasurement: runItemMeasurement,
    entryReads: entryReads,
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
    environment: params.environment,
    reservedEntryPaths: reservedEntryPaths,
    // Explore comes last, so an item an earlier source found wins the overlap.
    phases: [
      setup,
      catalog,
      trash,
      artifacts,
      apps,
      userFiles,
      orphans,
      { decisions: explore.decisions, issues: explore.issues },
      exploreAdvice,
    ],
    incompleteExploreAdvice: incompleteExploreAdvice,
    appAdvice: decideAppAdvice({ apps: installed.advisedApps }),
    evictedEntryCount: evictedEntryPaths.size,
  });
}

/** The platform's installed apps, read from the environment's app folders as its app section says. */
async function loadPlatformApps(params: {
  apps: ScanPlatformApps;
  appDirs: AbsolutePath[];
}): Promise<PlatformApps> {
  switch (params.apps.appSection) {
    case 'offerUnusedApps': {
      const installed = await params.apps.loadInstalledApps({
        appDirs: params.appDirs,
        commandTimeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
      });

      return { installedApps: installed.apps, advisedApps: [], issues: installed.issues };
    }
    case 'adviseOnly': {
      const advised = await params.apps.loadAdvisedApps();

      return { installedApps: [], advisedApps: advised.apps, issues: advised.issues };
    }
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

      return loadAppPhase({ apps: params.apps, context: params.context });
    case 'adviseOnly':
      // The system's own estimates size the advice, so no app is measured or offered.
      return Promise.resolve({ decisions: [], issues: [] });
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

      return loadOrphanPhase({ context: params.context, locations: params.apps.orphanLocations });
    case 'adviseOnly':
      // An app the user uninstalls in the system's settings takes its data with it there.
      return Promise.resolve({ decisions: [], issues: [] });
  }
}

/** The platform's trash: an entry of the catalog phase, or one Recycle Bin per file system root. */
async function loadTrashPhase(params: {
  trash: ScanPlatformTrash;
  context: ScanContext;
  onStep: (step: ScanProgressStep) => void;
}): Promise<ScanPhase> {
  switch (params.trash.kind) {
    case 'catalogFolder':
      return { decisions: [], issues: [] };
    case 'recycleBins': {
      const trash = params.trash;

      // The bins are known storage locations, as the Trash is an entry of the catalog on macOS.
      params.onStep({ message: `Measuring the ${trash.title}…`, phase: 'catalog' });

      const binPhases = params.context.environment.protectedRootPaths.map(
        (driveRootPath): ScanPhase => {
          const content = trash.loadRecycleBin({ driveRootPath: driveRootPath });

          if (content.kind === 'failed') {
            return {
              decisions: [],
              issues: [{ path: driveRootPath, reason: 'unexpected', detail: content.failure }],
            };
          }

          return {
            decisions: decideRecycleBinCandidate({
              pathRules: params.context.environment.pathRules,
              trash: trash,
              driveRootPath: driveRootPath,
              content: content.value,
              minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
            }),
            issues: [],
          };
        },
      );

      return mergeScanPhases({ phases: binPhases });
    }
  }
}

/**
 * Dedupes what the finished phases found the same way the report does, and leaves out each offer
 * that is, holds, or lies in a place a probe still running may claim, so a total grows to the
 * report's and never shrinks for a claim. An offer the report holds back for a skip or an advice
 * of the Explore phase inside it can still count here.
 */
function buildScanProgress(params: {
  step: ScanProgressStep;
  environment: Environment;
  reservedEntryPaths: string[];
  probeClaimPaths: string[];
  finishedPhases: ScanPhase[];
}): ScanProgress {
  const decisions = dedupeScanDecisions({
    environment: params.environment,
    reservedEntryPaths: params.reservedEntryPaths,
    decisions: mergeScanPhases({ phases: params.finishedPhases }).decisions,
  });

  return {
    message: params.step.message,
    phase: params.step.phase,
    found: buildSectionTotals({
      candidates: decisions.flatMap((decision) =>
        decision.kind === 'offer' &&
        !isInProbeClaim({
          pathRules: params.environment.pathRules,
          candidate: decision.candidate,
          probeClaimPaths: params.probeClaimPaths,
        })
          ? [decision.candidate]
          : [],
      ),
      advice: decisions.flatMap((decision) =>
        decision.kind === 'advice' ? [decision.advice] : [],
      ),
    }),
  };
}

/**
 * Dedupes the decisions of the phases as `dedupeScanDecisions` does, then adds the advice of the
 * Explore entries whose probe judged only part of their units, and builds the report.
 */
export function buildScanReportOfPhases(params: {
  environment: Environment;
  reservedEntryPaths: string[];
  phases: ScanPhase[];
  incompleteExploreAdvice: ScanPhase;
  appAdvice: AdvisedApp[];
  evictedEntryCount: number;
}): ScanReport {
  const scan = mergeScanPhases({ phases: params.phases });

  return buildScanReport({
    decisions: [
      ...dedupeScanDecisions({
        environment: params.environment,
        reservedEntryPaths: params.reservedEntryPaths,
        decisions: scan.decisions,
      }),
      // Added after the dedupe, so this advice holds back no offer of its own entry, whose units
      // lie inside its path. Moved before it, the advice would skip every finding of its probe.
      ...params.incompleteExploreAdvice.decisions,
    ],
    appAdvice: params.appAdvice,
    evictedEntryCount: params.evictedEntryCount,
    issues: [...scan.issues, ...params.incompleteExploreAdvice.issues],
  });
}

/**
 * Skips the offers the removal plan would refuse, then dedupes the decisions in their order, with
 * the paths of the Explore entries reserved for their probes: the one chain of the progress and
 * the report.
 */
function dedupeScanDecisions(params: {
  environment: Environment;
  reservedEntryPaths: string[];
  decisions: CandidateDecision[];
}): CandidateDecision[] {
  return dedupeCandidates({
    pathRules: params.environment.pathRules,
    decisions: skipOffersTheRemovalRefuses({
      environment: params.environment,
      decisions: params.decisions,
    }),
    reservedEntryPaths: params.reservedEntryPaths,
  });
}

/** The roots of every IDE version below the home folder, of each kind. */
function listIdeVersionRootPaths(params: {
  environment: Environment;
  roots: IdeVersionRoots;
}): string[] {
  return [...params.roots.caches, ...params.roots.logs, ...params.roots.settings].map((names) =>
    joinAbsolutePath({
      rules: params.environment.pathRules,
      parentPath: params.environment.homeDir,
      names: names,
    }),
  );
}

/** Whether an offer no probe made is, holds, or lies in one of `probeClaimPaths`. */
function isInProbeClaim(params: {
  pathRules: PathRules;
  candidate: Candidate;
  probeClaimPaths: string[];
}): boolean {
  if (isProbedCandidate(params.candidate)) {
    return false;
  }

  return listCandidateFootprint(params.candidate).some((path) =>
    params.probeClaimPaths.some((claimPath) =>
      isOverlappingPath({ rules: params.pathRules, path: path, otherPath: claimPath }),
    ),
  );
}

/**
 * The entry reads `entryReads` whose eviction check also adds the path of each entry it answers
 * true for to `evictedPaths`. A walk skips every such entry, so the set holds each entry a walk
 * left unread.
 */
function recordEvictedEntries(params: {
  entryReads: EntryReads;
  evictedPaths: Set<string>;
}): EntryReads {
  return {
    isEntryEvicted: (entry: EvictionCandidate): boolean => {
      const isEvicted = params.entryReads.isEntryEvicted(entry);

      if (isEvicted) {
        params.evictedPaths.add(entry.path);
      }

      return isEvicted;
    },
    loadPrivateBytes: params.entryReads.loadPrivateBytes,
  };
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
  // After the targets, so a skip holds back no earlier entry's offer of the same path.
  const overlapping: ScanPhase = {
    decisions: found.overlappingTargets.map((target) => ({
      kind: 'skip',
      path: target.path,
      reason: 'overlapsEarlierCandidate',
    })),
    issues: [],
  };

  return mergeScanPhases({
    phases: [{ decisions: [], issues: found.issues }, ...targetPhases, overlapping],
  });
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

  const carvedPaths = buildCarvedPaths({
    pathRules: params.context.environment.pathRules,
    entry: entry,
    path: path,
  });

  return loadMeasuredTargetsPhase({
    found: mapNonEmpty(params.target.targetPaths, (targetPath) => ({ path: targetPath })),
    carve:
      carvedPaths.length === 0
        ? null
        : { pathRules: params.context.environment.pathRules, carvedPaths: carvedPaths },
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
              excludedPaths: new Set(),
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
        removalOwner: findRemovalOwner({
          owner: owner,
          environment: params.context.environment,
          installedApps: params.context.installedApps,
          systemApps: params.context.systemApps,
        }),
        ownerState: resolveOwnerState({
          environment: params.context.environment,
          owner: owner,
          installedApps: params.context.installedApps,
          systemApps: params.context.systemApps,
          processCommands: params.context.processCommands,
        }),
        ownerAppName: findOwnerAppName({
          owner: owner,
          installedApps: params.context.installedApps,
          systemApps: params.context.systemApps,
        }),
        isOwnerUninstalled: isOwnerUninstalled({
          owner: owner,
          installedApps: params.context.installedApps,
          systemApps: params.context.systemApps,
          isInstalledAppListComplete: params.context.isInstalledAppListComplete,
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
  const artifactPaths = new Set(found.artifacts.map((finding) => finding.artifactPath));
  const findingPhases = await Promise.all(
    found.artifacts.map((finding) =>
      loadArtifactFindingPhase({
        context: params.context,
        finding: finding,
        artifactPaths: artifactPaths,
      }),
    ),
  );

  return mergeScanPhases({ phases: [{ decisions: [], issues: found.issues }, ...findingPhases] });
}

/** One artifact, judged by the activity of its project less every artifact the walk found. */
function loadArtifactFindingPhase(params: {
  context: ScanContext;
  finding: ArtifactFinding;
  artifactPaths: ReadonlySet<string>;
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
        excludedPaths: params.artifactPaths,
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

async function loadAppPhase(params: {
  apps: ScanPlatformAppsOffered;
  context: ScanContext;
}): Promise<ScanPhase> {
  const appPhases = await Promise.all(
    params.context.installedApps.map((app) =>
      loadAppItemPhase({ apps: params.apps, context: params.context, app: app }),
    ),
  );

  return mergeScanPhases({ phases: appPhases });
}

function loadAppItemPhase(params: {
  apps: ScanPlatformAppsOffered;
  context: ScanContext;
  app: InstalledApp;
}): Promise<ScanPhase> {
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
          environment: params.context.environment,
          owner: buildAppOwner({ app: app }),
          installedApps: params.context.installedApps,
          systemApps: params.context.systemApps,
          processCommands: params.context.processCommands,
        }),
        isProtectedDeveloperApp: isProtectedDeveloperApp({
          app: app,
          appRealPath: measurement.identity.realPath,
          activeXcodeBundlePath: params.context.activeXcodeBundlePath,
          xcodeBundleIdPrefix: params.apps.xcodeBundleIdPrefix,
        }),
        minAppBytes: SCAN_LIMITS.minAppBytes,
        systemVersion: params.context.systemVersion,
        nowMs: params.context.environment.nowMs,
        user: params.context.environment.user,
      });
    },
  });
}

async function loadUserFilePhase(params: {
  context: ScanContext;
  artifactRules: ProjectArtifactRule[];
}): Promise<ScanPhase> {
  const found = await findLargeUserFiles({
    rootDirs: params.context.userFileRootPaths,
    artifactRules: params.artifactRules,
    minAllocatedBytes: SCAN_LIMITS.minUserFileBytes,
    deadlineMs: Date.now() + SCAN_LIMITS.walkTimeoutMs,
    entryReads: params.context.entryReads,
    privacyDenialCode: params.context.privacyDenialCode,
  });
  const decisions = found.findings.map((finding) =>
    decideUserFileCandidate({
      finding: finding,
      unusedCutoffMs: params.context.unusedCutoffMs,
      minUserFileBytes: SCAN_LIMITS.minUserFileBytes,
    }),
  );

  return { decisions: decisions, issues: found.issues };
}

async function loadOrphanPhase(params: {
  context: ScanContext;
  locations: OrphanLocation[];
}): Promise<ScanPhase> {
  const installed = buildOrphanInstalledFacts({
    apps: params.context.installedApps,
    applicationDirs: params.context.environment.applicationDirs,
    isComplete: params.context.isInstalledAppListComplete,
  });
  const locationPhases = await Promise.all(
    params.locations.map((location) =>
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
  xcodeBundleIdPrefix: string;
}): boolean {
  if (params.activeXcodeBundlePath.kind === 'failed') {
    return params.app.bundleId?.startsWith(params.xcodeBundleIdPrefix) ?? false;
  }

  return params.appRealPath === params.activeXcodeBundlePath.value;
}

function buildCommandIssues(params: {
  results: Result<unknown, RunningProcessesFailure>[];
}): ScanIssue[] {
  return params.results.flatMap((result) =>
    result.kind === 'succeeded' ? [] : [buildCommandIssue({ failure: result.failure })],
  );
}

/** A failed command by its name and reason; a failed system call by its name and error code. */
function buildCommandIssue(params: { failure: RunningProcessesFailure }): ScanIssue {
  switch (params.failure.reason) {
    case 'timedOut':
    case 'exitedWithError':
    case 'spawnFailed':
      return {
        path: params.failure.command,
        reason: 'commandFailed',
        detail: params.failure.reason,
      };
    case 'callFailed':
      return {
        path: params.failure.call,
        reason: 'commandFailed',
        detail: `callFailed ${params.failure.code}`,
      };
  }
}
