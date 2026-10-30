import type { ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { ReadFailure } from '../system/readFailure.js';
import type { LocatedTool, ToolLookupFailureUntrusted } from '../tools/findTrustedTool.js';
import { findTrustedTool } from '../tools/findTrustedTool.js';
import type { ToolInstallLocations } from '../tools/toolInstallLocations.js';
import {
  loadAndroidAvdFindings,
  loadAndroidEmulatorFindings,
  loadAndroidSystemImageFindings,
} from './android/loadAndroidProbeFindings.js';
import { buildDartPubCacheFindings } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import type {
  ExploreProbe,
  ExploreProbeFiles,
  ExploreProbeRun,
  ExploreProbeTool,
  ExploreProbeToolRun,
} from './exploreProbe.js';
import type { ExploreFinding, ExploreToolFailure } from './exploreUnit.js';
import { loadHomebrewFindings } from './homebrew/loadHomebrewFindings.js';
import { EXPLORE_PROBE_DEADLINE_GRACE_MS } from './limits.js';
import type { ExploreProbeDefinition } from './loadProbeOutput.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { buildMiseVersionFindings } from './miseVersions/buildMiseVersionFindings.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { buildSimulatorDeviceFindings } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';
import { loadSimulatorRuntimeFindings } from './simulatorRuntimes/loadSimulatorRuntimeFindings.js';
import { loadVscodeExtensionFindings } from './vscodeExtensions/loadVscodeExtensionFindings.js';

/** What the probe judged; `isComplete` is false when it could not judge some or all of its units. */
export type ExploreProbeOutcomeProbed = {
  kind: 'probed';
  findings: ExploreFinding[];
  isComplete: boolean;
};

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
};

const EXPLORE_PROBES: Record<ExploreProbeId, ExploreProbe> = {
  simulatorDevices: buildCommandProbe({
    definition: SIMULATOR_DEVICE_LIST_PROBE,
    isActiveXcodeRequired: true,
    buildFindings: (probed) =>
      buildSimulatorDeviceFindings({
        tool: probed.run.tool,
        devices: probed.output,
        processCommands: probed.run.processCommands,
      }),
  }),
  dartPubCache: buildCommandProbe({
    definition: DART_PUB_CACHE_GC_DRY_RUN_PROBE,
    isActiveXcodeRequired: false,
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
    isActiveXcodeRequired: false,
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
    isActiveXcodeRequired: true,
    loadFindings: loadSimulatorRuntimeFindings,
  },
  androidAvds: {
    kind: 'tool',
    toolName: 'avdmanager',
    isActiveXcodeRequired: false,
    loadFindings: loadAndroidAvdFindings,
  },
  androidSystemImages: { kind: 'files', loadFindings: loadAndroidSystemImageFindings },
  androidEmulator: { kind: 'files', loadFindings: loadAndroidEmulatorFindings },
  homebrewAppleSilicon: {
    kind: 'tool',
    toolName: 'brewAppleSilicon',
    isActiveXcodeRequired: false,
    loadFindings: loadHomebrewFindings,
  },
  homebrewIntel: {
    kind: 'tool',
    toolName: 'brewIntel',
    isActiveXcodeRequired: false,
    loadFindings: loadHomebrewFindings,
  },
  vscodeExtensions: { kind: 'files', loadFindings: loadVscodeExtensionFindings },
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
  };
}

/** A probe of one read-only command whose parsed output its findings come from, all judged. */
function buildCommandProbe<T>(params: {
  definition: ExploreProbeDefinition<T>;
  isActiveXcodeRequired: boolean;
  buildFindings: (probed: { run: ExploreProbeToolRun; output: T }) => ExploreFinding[];
}): ExploreProbeTool {
  return {
    kind: 'tool',
    toolName: params.definition.toolName,
    isActiveXcodeRequired: params.isActiveXcodeRequired,
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
 * Runs one probe once the processes are read. It answers `timedOut` when it is still running
 * `timeoutMs` plus the grace later: the Xcode wait, the tool lookup, and the loader all count. A
 * command still running at the deadline fails first, naming its tool.
 */
export async function runExploreProbe(params: {
  probe: ExploreProbe;
  start: ExploreProbeStart;
}): Promise<ExploreProbeOutcome> {
  // The processes are read before any tool starts, or a probe's own tool would show as running.
  const processCommands = await params.start.processCommands;
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
  }
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
  if (params.probe.isActiveXcodeRequired && (await params.start.activeXcodeBundlePath) === null) {
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

  return {
    kind: 'probed',
    findings: findings.value.findings,
    isComplete: findings.value.isComplete,
  };
}

async function runExploreFilesProbe(params: {
  probe: ExploreProbeFiles;
  run: ExploreProbeRun;
}): Promise<ExploreProbeOutcome> {
  const findings = await params.probe.loadFindings(params.run);

  if (findings.kind === 'failed') {
    return { kind: 'unreadable', path: findings.failure.path, failure: findings.failure.failure };
  }

  return {
    kind: 'probed',
    findings: findings.value.findings,
    isComplete: findings.value.isComplete,
  };
}
