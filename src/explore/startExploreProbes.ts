import type { ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { LocatedTool, ToolLookupFailureUntrusted } from '../tools/findTrustedTool.js';
import { findTrustedTool } from '../tools/findTrustedTool.js';
import type { ToolInstallLocations } from '../tools/toolInstallLocations.js';
import { loadAndroidPlatformFindings } from './android/loadAndroidPlatformFindings.js';
import {
  loadAndroidAvdFindings,
  loadAndroidEmulatorFindings,
  loadAndroidSystemImageFindings,
} from './android/loadAndroidProbeFindings.js';
import { loadAsdfVersionFindings } from './asdfVersions/loadAsdfVersionFindings.js';
import { buildDartPubCacheFindings } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import type {
  ExploreProbe,
  ExploreProbeFiles,
  ExploreProbePinned,
  ExploreProbeRun,
  ExploreProbeTool,
  ExploreProbeToolRun,
} from './exploreProbe.js';
import type { ExploreFinding, ExploreProbeFindings, ExploreToolFailure } from './exploreUnit.js';
import { loadHomebrewFindings } from './homebrew/loadHomebrewFindings.js';
import { EXPLORE_PROBE_DEADLINE_GRACE_MS } from './limits.js';
import type { ExploreProbeDefinition } from './loadProbeOutput.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { buildMiseVersionFindings } from './miseVersions/buildMiseVersionFindings.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { loadNvmVersionFindings } from './nvmVersions/loadNvmVersionFindings.js';
import { loadPnpmStoreFindings } from './pnpmStores/loadPnpmStoreFindings.js';
import {
  PNPM_STORE_ROOT_PATH_NAMES,
  PNPM_XDG_STORE_ROOT_PATH_NAMES,
} from './pnpmStores/pnpmStoreRoots.js';
import type { ProjectPinsLoad } from './projectPins/loadProjectPins.js';
import { buildSimulatorDeviceFindings } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';
import { loadSimulatorRuntimeFindings } from './simulatorRuntimes/loadSimulatorRuntimeFindings.js';
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

export type ExploreProbeOutcome =
  | ExploreProbeOutcomeProbed
  | ExploreProbeOutcomeToolMissing
  | ExploreProbeOutcomeToolUntrusted
  | ExploreProbeOutcomeFailed
  | ExploreProbeOutcomeUnreadable
  | ExploreProbeOutcomeTimedOut;

type ExploreProbeStart = {
  environment: Environment;
  toolInstallLocations: ToolInstallLocations;
  processCommands: Promise<string[] | null>;
  activeXcodeBundlePath: Promise<string | null>;
  /** The limit of a whole probe, its lookup, commands, and reads together. */
  timeoutMs: number;
  /** The scan's cutoff of last use, the same value the scan context holds. */
  unusedCutoffMs: number;
  /** The end of the project walk and the pins it found, which every pinned probe waits for. */
  projectPins: ProjectPinsLoad;
};

const EXPLORE_PROBES: Record<ExploreProbeId, ExploreProbe> = {
  simulatorDevices: buildCommandProbe({
    definition: SIMULATOR_DEVICE_LIST_PROBE,
    buildFindings: (probed) =>
      buildSimulatorDeviceFindings({
        tool: probed.run.tool,
        devices: probed.output,
        processCommands: probed.run.processCommands,
      }),
  }),
  dartPubCache: buildCommandProbe({
    definition: DART_PUB_CACHE_GC_DRY_RUN_PROBE,
    buildFindings: (probed) =>
      buildDartPubCacheFindings({
        tool: probed.run.tool,
        gcPaths: probed.output,
        homeDir: probed.run.environment.homeDir,
        processCommands: probed.run.processCommands,
      }),
  }),
  miseVersions: buildCommandProbe({
    definition: MISE_PRUNABLE_LIST_PROBE,
    buildFindings: (probed) =>
      buildMiseVersionFindings({
        tool: probed.run.tool,
        versions: probed.output,
        homeDir: probed.run.environment.homeDir,
        processCommands: probed.run.processCommands,
      }),
  }),
  simulatorRuntimes: {
    kind: 'tool',
    toolName: 'xcrun',
    loadFindings: loadSimulatorRuntimeFindings,
  },
  androidAvds: {
    kind: 'tool',
    toolName: 'avdmanager',
    loadFindings: loadAndroidAvdFindings,
  },
  androidSystemImages: { kind: 'files', loadFindings: loadAndroidSystemImageFindings },
  androidEmulator: { kind: 'files', loadFindings: loadAndroidEmulatorFindings },
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
    buildProbe: (params) => ({
      kind: 'files',
      loadFindings: (run) =>
        loadAndroidPlatformFindings({ run: run, projectPins: params.projectPins }),
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
          storeRootPathNames: PNPM_STORE_ROOT_PATH_NAMES,
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
          storeRootPathNames: PNPM_XDG_STORE_ROOT_PATH_NAMES,
        }),
    }),
  },
};

/**
 * Starts every probe at once and never rejects: each promise ends in an outcome. Each probe waits
 * for `processCommands` before it starts, so its own tool never shows as running, and the
 * simulator probes for `activeXcodeBundlePath`; without an active Xcode they answer `toolMissing`
 * and run nothing. The activity of each finding comes from `decideUnitActivity`, so `null`
 * processes leave `unknown` only units whose busy rule reads processes.
 */
export function startExploreProbes(
  params: ExploreProbeStart,
): Record<ExploreProbeId, Promise<ExploreProbeOutcome>> {
  return {
    simulatorDevices: runExploreProbe({ probe: EXPLORE_PROBES.simulatorDevices, start: params }),
    dartPubCache: runExploreProbe({ probe: EXPLORE_PROBES.dartPubCache, start: params }),
    miseVersions: runExploreProbe({ probe: EXPLORE_PROBES.miseVersions, start: params }),
    simulatorRuntimes: runExploreProbe({ probe: EXPLORE_PROBES.simulatorRuntimes, start: params }),
    androidAvds: runExploreProbe({ probe: EXPLORE_PROBES.androidAvds, start: params }),
    androidSystemImages: runExploreProbe({
      probe: EXPLORE_PROBES.androidSystemImages,
      start: params,
    }),
    androidEmulator: runExploreProbe({ probe: EXPLORE_PROBES.androidEmulator, start: params }),
    homebrewAppleSilicon: runExploreProbe({
      probe: EXPLORE_PROBES.homebrewAppleSilicon,
      start: params,
    }),
    homebrewIntel: runExploreProbe({ probe: EXPLORE_PROBES.homebrewIntel, start: params }),
    vscodeExtensions: runExploreProbe({ probe: EXPLORE_PROBES.vscodeExtensions, start: params }),
    asdfVersions: runExploreProbe({ probe: EXPLORE_PROBES.asdfVersions, start: params }),
    nvmVersions: runExploreProbe({ probe: EXPLORE_PROBES.nvmVersions, start: params }),
    androidPlatforms: runExploreProbe({ probe: EXPLORE_PROBES.androidPlatforms, start: params }),
    pnpmStores: runExploreProbe({ probe: EXPLORE_PROBES.pnpmStores, start: params }),
    pnpmStoresXdg: runExploreProbe({ probe: EXPLORE_PROBES.pnpmStoresXdg, start: params }),
  };
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
 * Runs one probe once the processes are read, and a pinned one once the project walk ended too. It
 * answers `timedOut` when it is still running `timeoutMs` plus the grace later: the Xcode wait,
 * the read of the pins, the tool lookup, and the loader all count. A command still running at the
 * deadline fails first, naming its tool.
 */
export async function runExploreProbe(params: {
  probe: ExploreProbe;
  start: ExploreProbeStart;
}): Promise<ExploreProbeOutcome> {
  // The processes are read before any tool starts, or a probe's own tool would show as running.
  const processCommands = await params.start.processCommands;

  // The walk has a limit of its own, so a pinned probe's limit starts once it ended.
  if (params.probe.kind === 'pinned') {
    await params.start.projectPins.walkEnded;
  }

  const run: ExploreProbeRun = {
    environment: params.start.environment,
    processCommands: processCommands,
    deadlineMs: Date.now() + params.start.timeoutMs,
    unusedCutoffMs: params.start.unusedCutoffMs,
  };

  return raceExploreProbeDeadline({
    outcome: runExploreProbeOfKind({ probe: params.probe, start: params.start, run: run }),
    deadlineMs: run.deadlineMs,
  });
}

function runExploreProbeOfKind(params: {
  probe: ExploreProbe;
  start: ExploreProbeStart;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  switch (params.probe.kind) {
    case 'tool':
      return runExploreToolProbe({ probe: params.probe, start: params.start, run: params.run });
    case 'files':
      return runExploreFilesProbe({ probe: params.probe, run: params.run });
    case 'pinned':
      return runExplorePinnedProbe({ probe: params.probe, start: params.start, run: params.run });
  }
}

/** Builds the probe from the pins and runs it; pins that could not be read fail it at their path. */
async function runExplorePinnedProbe(params: {
  probe: ExploreProbePinned;
  start: ExploreProbeStart;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const pins = await params.start.projectPins.pins;

  if (pins.kind === 'failed') {
    return { kind: 'unreadable', path: pins.failure.path, failure: pins.failure.failure };
  }

  return runExploreProbeOfKind({
    probe: params.probe.buildProbe({ projectPins: pins.value }),
    start: params.start,
    run: params.run,
  });
}

/**
 * The outcome, or `timedOut` once the grace past `deadlineMs` passes first; the timer never
 * outlives the race.
 */
async function raceExploreProbeDeadline(params: {
  outcome: Promise<ExploreProbeOutcome>;
  deadlineMs: number;
}): Promise<ExploreProbeOutcome> {
  const timedOutAtMs = params.deadlineMs + EXPLORE_PROBE_DEADLINE_GRACE_MS;
  const deadline = Promise.withResolvers<ExploreProbeOutcomeTimedOut>();
  const timer = setTimeout(
    () => {
      deadline.resolve({ kind: 'timedOut' });
    },
    Math.max(0, timedOutAtMs - Date.now()),
  );

  try {
    return await Promise.race([params.outcome, deadline.promise]);
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
    homeDir: params.start.environment.homeDir,
    userId: params.start.environment.userId,
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
    return { kind: 'unreadable', path: findings.failure.path, failure: findings.failure.failure };
  }

  return { kind: 'probed', ...findings.value };
}
