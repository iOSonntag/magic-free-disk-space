import type { ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { Result } from '../result.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { RunningProcesses } from '../system/systemPlatform.js';
import type { LocatedTool, ToolLookupFailureUntrusted } from '../tools/findTrustedTool.js';
import { findTrustedTool } from '../tools/findTrustedTool.js';
import type { ToolInstallLocations } from '../tools/toolInstallLocations.js';
import { loadAndroidPlatformFindings } from './android/loadAndroidPlatformFindings.js';
import {
  loadAndroidAvdFindings,
  loadAndroidEmulatorFindings,
  loadAndroidSystemImageFindings,
} from './android/loadAndroidProbeFindings.js';
import type { AndroidSdkRoot } from './android/loadAndroidSdkRoots.js';
import { loadScanAndroidSdkRoots } from './android/loadAndroidSdkRoots.js';
import { loadAsdfVersionFindings } from './asdfVersions/loadAsdfVersionFindings.js';
import { loadClaudeCodeVersionFindings } from './claudeCodeVersions/loadClaudeCodeVersionFindings.js';
import { loadClaudeTranscriptFindings } from './claudeTranscripts/loadClaudeTranscriptFindings.js';
import { loadCondaPackageFindings } from './condaPackages/loadCondaPackageFindings.js';
import { buildDartPubCacheFindings } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import { loadDownloadsInstallerFindings } from './downloadsInstallers/loadDownloadsInstallerFindings.js';
import { buildEngineProbe } from './engines/buildEngineProbe.js';
import type {
  ExploreEngineAnswerFailure,
  ExploreProbe,
  ExploreProbeAndroidSdk,
  ExploreProbeEngine,
  ExploreProbeFiles,
  ExploreProbePinned,
  ExploreProbePlatform,
  ExploreProbeRun,
  ExploreProbeTool,
  ExploreProbeToolRun,
} from './exploreProbe.js';
import type {
  ExploreFileUnreadable,
  ExploreFinding,
  ExploreProbeFindings,
  ExploreToolFailure,
} from './exploreUnit.js';
import { loadFvmVersionFindings } from './fvmVersions/loadFvmVersionFindings.js';
import { loadHomebrewFindings } from './homebrew/loadHomebrewFindings.js';
import { loadHuggingFaceRepoFindings } from './huggingFace/loadHuggingFaceRepoFindings.js';
import { loadIcloudDownloadFindings } from './icloudDownloads/loadIcloudDownloadFindings.js';
import { loadIdeVersionFindings } from './ideVersions/loadIdeVersionFindings.js';
import { EXPLORE_PROBE_DEADLINE_GRACE_MS } from './limits.js';
import { loadLmStudioModelFindings } from './lmStudioModels/loadLmStudioModelFindings.js';
import type { ExploreProbeDefinition } from './loadProbeOutput.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { loadMailDownloadFindings } from './mailDownloads/loadMailDownloadFindings.js';
import { buildMiseVersionFindings } from './miseVersions/buildMiseVersionFindings.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { loadNvmVersionFindings } from './nvmVersions/loadNvmVersionFindings.js';
import { loadOllamaModelFindings } from './ollamaModels/loadOllamaModelFindings.js';
import { loadPnpmStoreFindings } from './pnpmStores/loadPnpmStoreFindings.js';
import type { ProjectPinsLoad } from './projectPins/loadProjectPins.js';
import { loadRustupToolchainFindings } from './rustupToolchains/loadRustupToolchainFindings.js';
import { buildSimulatorDeviceFindings } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';
import { loadSimulatorRuntimeFindings } from './simulatorRuntimes/loadSimulatorRuntimeFindings.js';
import { loadVagrantBoxFindings } from './vagrantBoxes/loadVagrantBoxFindings.js';
import { loadVscodeExtensionFindings } from './vscodeExtensions/loadVscodeExtensionFindings.js';

/** What the probe judged; `isComplete` is false when it could not judge some or all of its units. */
export type ExploreProbeOutcomeProbed = { kind: 'probed' } & ExploreProbeFindings;

export type ExploreProbeOutcomeToolMissing = { kind: 'toolMissing' };

export type ExploreProbeOutcomeToolUntrusted = {
  kind: 'toolUntrusted';
  failure: ToolLookupFailureUntrusted;
};

/** A command of the probe or its output failed. */
export type ExploreProbeOutcomeFailed = {
  kind: 'failed';
  tool: LocatedTool;
  failure: ExploreToolFailure;
};

/** A file the probe needs could not be read. */
export type ExploreProbeOutcomeUnreadable = {
  kind: 'unreadable';
  path: string;
  failure: ReadFailure;
};

/**
 * The probe was still running a grace past its deadline; whatever it still does is no longer
 * awaited.
 */
export type ExploreProbeOutcomeTimedOut = { kind: 'timedOut' };

/** The engine behind `socketPath`, the socket the probe trusted, answered but not as asked. */
export type ExploreProbeOutcomeEngineFailed = {
  kind: 'engineFailed';
  socketPath: AbsolutePath;
  failure: ExploreEngineAnswerFailure;
};

export type ExploreProbeOutcome =
  | ExploreProbeOutcomeProbed
  | ExploreProbeOutcomeToolMissing
  | ExploreProbeOutcomeToolUntrusted
  | ExploreProbeOutcomeFailed
  | ExploreProbeOutcomeUnreadable
  | ExploreProbeOutcomeTimedOut
  | ExploreProbeOutcomeEngineFailed;

/** What the probes of a scan start from. */
export type ExploreProbeStart = {
  environment: Environment;
  platform: ExploreProbePlatform;
  toolInstallLocations: ToolInstallLocations;
  runningProcesses: Promise<RunningProcesses | null>;
  activeXcodeBundlePath: Promise<string | null>;
  /** The limit of a whole probe, its lookup, commands, and reads together. */
  timeoutMs: number;
  /** The scan's cutoff of last use, the same value the scan context holds. */
  unusedCutoffMs: number;
  /** The scan's cutoff of the stale window, the same value the scan context holds. */
  staleCutoffMs: number;
  /** The end of the project walk and the pins it found, which every pinned probe waits for. */
  projectPins: ProjectPinsLoad;
};

/** What the probes of one scan share: their start, and the SDK roots every Android probe reads. */
export type ExploreProbeScan = {
  start: ExploreProbeStart;
  androidSdkRoots: Promise<Result<AndroidSdkRoot[], ExploreFileUnreadable>>;
};

/** The probes of a scan, each running. */
export type ExploreProbesStarted = {
  outcomes: Record<ExploreProbeId, Promise<ExploreProbeOutcome>>;
  /**
   * The roots the probes take outside their catalog entries, for the scan to claim: the Android
   * SDK roots that Flutter's settings and the projects name, none once the Android probes timed
   * out reading them. Never rejects.
   */
  claimRootsLoad: Promise<AbsolutePath[]>;
};

const EXPLORE_PROBES: Record<ExploreProbeId, ExploreProbe> = {
  simulatorDevices: buildCommandProbe({
    definition: SIMULATOR_DEVICE_LIST_PROBE,
    buildFindings: (probed) =>
      buildSimulatorDeviceFindings({
        tool: probed.run.tool,
        devices: probed.output,
        runningProcesses: probed.run.runningProcesses,
      }),
  }),
  dartPubCache: buildCommandProbe({
    definition: DART_PUB_CACHE_GC_DRY_RUN_PROBE,
    buildFindings: (probed) =>
      buildDartPubCacheFindings({
        tool: probed.run.tool,
        gcPaths: probed.output,
        pathRules: probed.run.environment.pathRules,
        homeDir: probed.run.environment.homeDir,
        runningProcesses: probed.run.runningProcesses,
      }),
  }),
  miseVersions: buildCommandProbe({
    definition: MISE_PRUNABLE_LIST_PROBE,
    buildFindings: (probed) =>
      buildMiseVersionFindings({
        tool: probed.run.tool,
        versions: probed.output,
        pathRules: probed.run.environment.pathRules,
        homeDir: probed.run.environment.homeDir,
        runningProcesses: probed.run.runningProcesses,
      }),
  }),
  simulatorRuntimes: {
    kind: 'tool',
    toolName: 'xcrun',
    loadFindings: loadSimulatorRuntimeFindings,
  },
  androidAvds: {
    kind: 'androidSdk',
    buildProbe: (params) => ({
      kind: 'tool',
      toolName: 'avdmanager',
      loadFindings: (run) => loadAndroidAvdFindings({ run: run, sdkRoots: params.sdkRoots }),
    }),
  },
  androidSystemImages: {
    kind: 'androidSdk',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) =>
        loadAndroidSystemImageFindings({ run: run, sdkRoots: params.sdkRoots }),
    }),
  },
  androidEmulator: {
    kind: 'androidSdk',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) => loadAndroidEmulatorFindings({ run: run, sdkRoots: params.sdkRoots }),
    }),
  },
  homebrewAppleSilicon: {
    kind: 'tool',
    toolName: 'brewAppleSilicon',
    loadFindings: loadHomebrewFindings,
  },
  homebrewIntel: {
    kind: 'tool',
    toolName: 'brewIntel',
    loadFindings: loadHomebrewFindings,
  },
  vscodeExtensions: { kind: 'files', loadFindings: loadVscodeExtensionFindings },
  asdfVersions: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'tool',
      toolName: 'asdf',
      loadFindings: (run) => loadAsdfVersionFindings({ run: run, projectPins: params.projectPins }),
    }),
  },
  nvmVersions: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) => loadNvmVersionFindings({ run: run, projectPins: params.projectPins }),
    }),
  },
  androidPlatforms: {
    kind: 'pinned',
    buildProbe: (pins) => ({
      kind: 'androidSdk',
      buildProbe: (roots) => ({
        kind: 'files',
        loadFindings: (run) =>
          loadAndroidPlatformFindings({
            run: run,
            projectPins: pins.projectPins,
            sdkRoots: roots.sdkRoots,
          }),
      }),
    }),
  },
  pnpmStores: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) =>
        loadPnpmStoreFindings({
          run: run,
          projectPins: params.projectPins,
          storeLocation: run.platform.explore.pnpmStoreRoot,
        }),
    }),
  },
  pnpmStoresXdg: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) =>
        loadPnpmStoreFindings({
          run: run,
          projectPins: params.projectPins,
          storeLocation: run.platform.explore.pnpmXdgStoreRoot,
        }),
    }),
  },
  dockerDesktopEngine: buildEngineProbe('dockerDesktopEngine'),
  orbStackEngine: buildEngineProbe('orbStackEngine'),
  colimaEngine: buildEngineProbe('colimaEngine'),
  vagrantBoxes: { kind: 'tool', toolName: 'vagrant', loadFindings: loadVagrantBoxFindings },
  icloudDownloads: { kind: 'tool', toolName: 'brctl', loadFindings: loadIcloudDownloadFindings },
  downloadsInstallers: { kind: 'files', loadFindings: loadDownloadsInstallerFindings },
  mailDownloads: { kind: 'files', loadFindings: loadMailDownloadFindings },
  ollamaModels: { kind: 'files', loadFindings: loadOllamaModelFindings },
  lmStudioModels: { kind: 'files', loadFindings: loadLmStudioModelFindings },
  huggingFaceRepos: { kind: 'files', loadFindings: loadHuggingFaceRepoFindings },
  claudeTranscripts: { kind: 'files', loadFindings: loadClaudeTranscriptFindings },
  claudeCodeVersions: { kind: 'files', loadFindings: loadClaudeCodeVersionFindings },
  ideVersions: { kind: 'files', loadFindings: loadIdeVersionFindings },
  rustupToolchains: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'tool',
      toolName: 'rustup',
      loadFindings: (run) =>
        loadRustupToolchainFindings({ run: run, projectPins: params.projectPins }),
    }),
  },
  condaPackages: { kind: 'tool', toolName: 'conda', loadFindings: loadCondaPackageFindings },
  fvmVersions: {
    kind: 'pinned',
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) => loadFvmVersionFindings({ run: run, projectPins: params.projectPins }),
    }),
  },
};

/**
 * Starts every probe at once and never rejects: each promise ends in an outcome. Each probe waits
 * for `runningProcesses` before it starts, so its own tool never shows as running, and the
 * simulator probes for `activeXcodeBundlePath`; without an active Xcode they answer `toolMissing`
 * and run nothing. The activity of each finding comes from `decideUnitActivity`, so `null`
 * processes leave `unknown` only units whose busy rule reads processes.
 */
export function startExploreProbes(params: ExploreProbeStart): ExploreProbesStarted {
  const scan = startExploreProbeScan(params);

  return {
    outcomes: {
      simulatorDevices: runExploreProbe({ probe: EXPLORE_PROBES.simulatorDevices, scan: scan }),
      dartPubCache: runExploreProbe({ probe: EXPLORE_PROBES.dartPubCache, scan: scan }),
      miseVersions: runExploreProbe({ probe: EXPLORE_PROBES.miseVersions, scan: scan }),
      simulatorRuntimes: runExploreProbe({ probe: EXPLORE_PROBES.simulatorRuntimes, scan: scan }),
      androidAvds: runExploreProbe({ probe: EXPLORE_PROBES.androidAvds, scan: scan }),
      androidSystemImages: runExploreProbe({
        probe: EXPLORE_PROBES.androidSystemImages,
        scan: scan,
      }),
      androidEmulator: runExploreProbe({ probe: EXPLORE_PROBES.androidEmulator, scan: scan }),
      homebrewAppleSilicon: runExploreProbe({
        probe: EXPLORE_PROBES.homebrewAppleSilicon,
        scan: scan,
      }),
      homebrewIntel: runExploreProbe({ probe: EXPLORE_PROBES.homebrewIntel, scan: scan }),
      vscodeExtensions: runExploreProbe({ probe: EXPLORE_PROBES.vscodeExtensions, scan: scan }),
      asdfVersions: runExploreProbe({ probe: EXPLORE_PROBES.asdfVersions, scan: scan }),
      nvmVersions: runExploreProbe({ probe: EXPLORE_PROBES.nvmVersions, scan: scan }),
      androidPlatforms: runExploreProbe({ probe: EXPLORE_PROBES.androidPlatforms, scan: scan }),
      pnpmStores: runExploreProbe({ probe: EXPLORE_PROBES.pnpmStores, scan: scan }),
      pnpmStoresXdg: runExploreProbe({ probe: EXPLORE_PROBES.pnpmStoresXdg, scan: scan }),
      dockerDesktopEngine: runExploreProbe({
        probe: EXPLORE_PROBES.dockerDesktopEngine,
        scan: scan,
      }),
      orbStackEngine: runExploreProbe({ probe: EXPLORE_PROBES.orbStackEngine, scan: scan }),
      colimaEngine: runExploreProbe({ probe: EXPLORE_PROBES.colimaEngine, scan: scan }),
      vagrantBoxes: runExploreProbe({ probe: EXPLORE_PROBES.vagrantBoxes, scan: scan }),
      icloudDownloads: runExploreProbe({ probe: EXPLORE_PROBES.icloudDownloads, scan: scan }),
      downloadsInstallers: runExploreProbe({
        probe: EXPLORE_PROBES.downloadsInstallers,
        scan: scan,
      }),
      mailDownloads: runExploreProbe({ probe: EXPLORE_PROBES.mailDownloads, scan: scan }),
      ollamaModels: runExploreProbe({ probe: EXPLORE_PROBES.ollamaModels, scan: scan }),
      lmStudioModels: runExploreProbe({ probe: EXPLORE_PROBES.lmStudioModels, scan: scan }),
      huggingFaceRepos: runExploreProbe({ probe: EXPLORE_PROBES.huggingFaceRepos, scan: scan }),
      claudeTranscripts: runExploreProbe({ probe: EXPLORE_PROBES.claudeTranscripts, scan: scan }),
      claudeCodeVersions: runExploreProbe({
        probe: EXPLORE_PROBES.claudeCodeVersions,
        scan: scan,
      }),
      ideVersions: runExploreProbe({ probe: EXPLORE_PROBES.ideVersions, scan: scan }),
      rustupToolchains: runExploreProbe({ probe: EXPLORE_PROBES.rustupToolchains, scan: scan }),
      condaPackages: runExploreProbe({ probe: EXPLORE_PROBES.condaPackages, scan: scan }),
      fvmVersions: runExploreProbe({ probe: EXPLORE_PROBES.fvmVersions, scan: scan }),
    },
    claimRootsLoad: loadAndroidSdkClaimRoots(scan),
  };
}

/** Starts the loads that the probes of the scan of `start` share; none of them rejects. */
export function startExploreProbeScan(start: ExploreProbeStart): ExploreProbeScan {
  return {
    start: start,
    androidSdkRoots: loadScanAndroidSdkRoots({
      environment: start.environment,
      platform: start.platform,
      projectPins: start.projectPins,
    }),
  };
}

/**
 * The claim roots of the scan's SDK roots, or none once their read passes the deadline of the
 * Android probes that share it, as every one of them timed out then.
 */
async function loadAndroidSdkClaimRoots(scan: ExploreProbeScan): Promise<AbsolutePath[]> {
  // The limit starts where an Android probe's does, so it never passes before theirs.
  await scan.start.runningProcesses;
  await scan.start.projectPins.walkEnded;

  return raceExploreProbeDeadline({
    pending: scan.androidSdkRoots.then(listAndroidSdkClaimRoots),
    deadlineMs: Date.now() + scan.start.timeoutMs,
    timedOutValue: [],
  });
}

/**
 * The SDK roots that are not required, those outside the platform's own SDK, whose catalog entry
 * the scan reserves already; none when the roots could not be read, since every probe of them
 * failed then.
 */
function listAndroidSdkClaimRoots(
  sdkRoots: Result<AndroidSdkRoot[], ExploreFileUnreadable>,
): AbsolutePath[] {
  if (sdkRoots.kind === 'failed') {
    return [];
  }

  return sdkRoots.value.flatMap((sdkRoot) => (sdkRoot.isRequired ? [] : [sdkRoot.path]));
}

/** A probe of one read-only command whose parsed output its findings come from, all judged. */
function buildCommandProbe<T>(params: {
  definition: ExploreProbeDefinition<T>;
  buildFindings: (probed: { run: ExploreProbeToolRun; output: T }) => ExploreFinding[];
}): ExploreProbeTool {
  return {
    kind: 'tool',
    toolName: params.definition.toolName,
    loadFindings: async (run) => {
      const output = await loadProbeOutput({
        probe: params.definition,
        tool: run.tool,
        environment: run.environment,
        processes: run.platform.toolProcesses,
        deadlineMs: run.deadlineMs,
      });

      if (output.kind === 'failed') {
        return output;
      }

      const findings = params.buildFindings({ run: run, output: output.value });

      return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
    },
  };
}

/**
 * Runs one probe of the scan once the processes are read, and a pinned or Android SDK one once the
 * project walk ended too. It answers `timedOut` when it is still running `timeoutMs` plus the
 * grace later: the Xcode wait, the read of the pins and of the SDK roots, the tool lookup, and the
 * loader all count. A command still running at the deadline fails first, naming its tool.
 */
export async function runExploreProbe(params: {
  probe: ExploreProbe;
  scan: ExploreProbeScan;
}): Promise<ExploreProbeOutcome> {
  // The processes are read before any tool starts, or a probe's own tool would show as running.
  const runningProcesses = await params.scan.start.runningProcesses;

  // The walk has a limit of its own, so the limit of a probe that reads what it found starts once
  // it ended.
  if (params.probe.kind === 'pinned' || params.probe.kind === 'androidSdk') {
    await params.scan.start.projectPins.walkEnded;
  }

  const run: ExploreProbeRun = {
    environment: params.scan.start.environment,
    platform: params.scan.start.platform,
    runningProcesses: runningProcesses,
    deadlineMs: Date.now() + params.scan.start.timeoutMs,
    unusedCutoffMs: params.scan.start.unusedCutoffMs,
    staleCutoffMs: params.scan.start.staleCutoffMs,
  };

  return raceExploreProbeDeadline<ExploreProbeOutcome>({
    pending: runExploreProbeOfKind({ probe: params.probe, scan: params.scan, run: run }),
    deadlineMs: run.deadlineMs,
    timedOutValue: { kind: 'timedOut' },
  });
}

function runExploreProbeOfKind(params: {
  probe: ExploreProbe;
  scan: ExploreProbeScan;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  switch (params.probe.kind) {
    case 'tool':
      return runExploreToolProbe({
        probe: params.probe,
        start: params.scan.start,
        run: params.run,
      });
    case 'files':
      return runExploreFilesProbe({ probe: params.probe, run: params.run });
    case 'pinned':
      return runExplorePinnedProbe({ probe: params.probe, scan: params.scan, run: params.run });
    case 'androidSdk':
      return runExploreAndroidSdkProbe({ probe: params.probe, scan: params.scan, run: params.run });
    case 'engine':
      return runExploreEngineProbe({ probe: params.probe, run: params.run });
  }
}

/** Builds the probe from the pins and runs it; pins that could not be read fail it at their path. */
async function runExplorePinnedProbe(params: {
  probe: ExploreProbePinned;
  scan: ExploreProbeScan;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const pins = await params.scan.start.projectPins.pins;

  if (pins.kind === 'failed') {
    return { kind: 'unreadable', path: pins.failure.path, failure: pins.failure.failure };
  }

  return runExploreProbeOfKind({
    probe: params.probe.buildProbe({ projectPins: pins.value }),
    scan: params.scan,
    run: params.run,
  });
}

/**
 * Builds the probe from the scan's SDK roots and runs it; roots that could not be read fail it at
 * their path.
 */
async function runExploreAndroidSdkProbe(params: {
  probe: ExploreProbeAndroidSdk;
  scan: ExploreProbeScan;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const sdkRoots = await params.scan.androidSdkRoots;

  if (sdkRoots.kind === 'failed') {
    return { kind: 'unreadable', path: sdkRoots.failure.path, failure: sdkRoots.failure.failure };
  }

  return runExploreProbeOfKind({
    probe: params.probe.buildProbe({ sdkRoots: sdkRoots.value }),
    scan: params.scan,
    run: params.run,
  });
}

/**
 * What `pending` gives, or `timedOutValue` once the grace past `deadlineMs` passes first; the timer
 * never outlives the race.
 */
async function raceExploreProbeDeadline<T>(params: {
  pending: Promise<T>;
  deadlineMs: number;
  timedOutValue: T;
}): Promise<T> {
  const timedOutAtMs = params.deadlineMs + EXPLORE_PROBE_DEADLINE_GRACE_MS;
  const deadline = Promise.withResolvers<T>();
  const timer = setTimeout(
    () => {
      deadline.resolve(params.timedOutValue);
    },
    Math.max(0, timedOutAtMs - Date.now()),
  );

  try {
    return await Promise.race([params.pending, deadline.promise]);
  } finally {
    clearTimeout(timer);
  }
}

async function runExploreToolProbe(params: {
  probe: ExploreProbeTool;
  start: ExploreProbeStart;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  // `xcrun simctl` without an active Xcode asks to install the command line tools.
  if (params.probe.toolName === 'xcrun' && (await params.start.activeXcodeBundlePath) === null) {
    return { kind: 'toolMissing' };
  }

  const found = await findTrustedTool({
    name: params.probe.toolName,
    locations: params.start.toolInstallLocations[params.probe.toolName],
    pathRules: params.start.environment.pathRules,
    homeDir: params.start.environment.homeDir,
    user: params.start.environment.user,
  });

  if (found.kind === 'failed') {
    switch (found.failure.reason) {
      case 'notFound':
        return { kind: 'toolMissing' };
      case 'untrusted':
        return { kind: 'toolUntrusted', failure: found.failure };
    }
  }

  const findings = await params.probe.loadFindings({ ...params.run, tool: found.value });

  if (findings.kind === 'failed') {
    switch (findings.failure.reason) {
      case 'fileUnreadable':
        return {
          kind: 'unreadable',
          path: findings.failure.path,
          failure: findings.failure.failure,
        };
      case 'commandFailed':
      case 'outputUnreadable':
        return { kind: 'failed', tool: found.value, failure: findings.failure };
      case 'placeMissing':
        return { kind: 'toolMissing' };
    }
  }

  return { kind: 'probed', ...findings.value };
}

async function runExploreFilesProbe(params: {
  probe: ExploreProbeFiles;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const findings = await params.probe.loadFindings(params.run);

  if (findings.kind === 'failed') {
    switch (findings.failure.reason) {
      case 'fileUnreadable':
        return {
          kind: 'unreadable',
          path: findings.failure.path,
          failure: findings.failure.failure,
        };
      case 'placeMissing':
        return { kind: 'toolMissing' };
    }
  }

  return { kind: 'probed', ...findings.value };
}

/**
 * A socket that is missing, refuses, or is not trusted reads as a missing tool, quietly: nothing
 * was asked. Only an engine that answered, but not as asked, fails the probe.
 */
async function runExploreEngineProbe(params: {
  probe: ExploreProbeEngine;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const findings = await params.probe.loadFindings(params.run);

  if (findings.kind === 'failed') {
    switch (findings.failure.kind) {
      case 'socketMissing':
      case 'socketUntrusted':
        return { kind: 'toolMissing' };
      case 'answerFailed':
        return {
          kind: 'engineFailed',
          socketPath: findings.failure.socketPath,
          failure: findings.failure.failure,
        };
    }
  }

  return { kind: 'probed', ...findings.value };
}
