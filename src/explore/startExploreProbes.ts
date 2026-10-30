import type { ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import type { LocatedTool, ToolLookupFailureUntrusted } from '../tools/findTrustedTool.js';
import { findTrustedTool } from '../tools/findTrustedTool.js';
import type { ToolInstallLocations, ToolName } from '../tools/toolInstallLocations.js';
import { buildDartPubCacheFindings } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import type { ExploreFinding, ExploreToolFailure } from './exploreUnit.js';
import type { ExploreProbeDefinition } from './loadProbeOutput.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { buildMiseVersionFindings } from './miseVersions/buildMiseVersionFindings.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { buildSimulatorDeviceFindings } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';

export type ExploreProbeOutcomeProbed = { kind: 'probed'; findings: ExploreFinding[] };

export type ExploreProbeOutcomeToolMissing = { kind: 'toolMissing' };

export type ExploreProbeOutcomeToolUntrusted = {
  kind: 'toolUntrusted';
  failure: ToolLookupFailureUntrusted;
};

export type ExploreProbeOutcomeFailed = {
  kind: 'failed';
  tool: LocatedTool;
  failure: ExploreToolFailure;
};

export type ExploreProbeOutcome =
  | ExploreProbeOutcomeProbed
  | ExploreProbeOutcomeToolMissing
  | ExploreProbeOutcomeToolUntrusted
  | ExploreProbeOutcomeFailed;

type ExploreProbeStart = {
  environment: Environment;
  toolInstallLocations: ToolInstallLocations;
  processCommands: Promise<string[] | null>;
  activeXcodeBundlePath: Promise<string | null>;
  timeoutMs: number;
};

type ExploreProbeRun = {
  tool: LocatedTool;
  environment: Environment;
  processCommands: string[] | null;
  timeoutMs: number;
};

type ExploreProbe = {
  toolName: ToolName;
  /** `xcrun simctl` without an active Xcode asks to install the command line tools. */
  isActiveXcodeRequired: boolean;
  loadFindings: (run: ExploreProbeRun) => Promise<Result<ExploreFinding[], ExploreToolFailure>>;
};

const EXPLORE_PROBES: Record<ExploreProbeId, ExploreProbe> = {
  simulatorDevices: buildExploreProbe({
    definition: SIMULATOR_DEVICE_LIST_PROBE,
    isActiveXcodeRequired: true,
    buildFindings: (probed) =>
      buildSimulatorDeviceFindings({
        tool: probed.run.tool,
        devices: probed.output,
        processCommands: probed.run.processCommands,
      }),
  }),
  dartPubCache: buildExploreProbe({
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
  miseVersions: buildExploreProbe({
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
};

/**
 * Starts every probe at once and never rejects: each promise ends in an outcome. Each probe waits
 * for `processCommands`, and the simulator probe for `activeXcodeBundlePath`, before it looks up
 * its tool; without an active Xcode the simulator probe answers `toolMissing` and runs nothing.
 * The activity of each finding comes from `decideUnitActivity`, so `null` processes leave
 * `unknown` only units whose busy rule reads processes.
 */
export function startExploreProbes(
  params: ExploreProbeStart,
): Record<ExploreProbeId, Promise<ExploreProbeOutcome>> {
  return {
    simulatorDevices: runExploreProbe({ probe: EXPLORE_PROBES.simulatorDevices, start: params }),
    dartPubCache: runExploreProbe({ probe: EXPLORE_PROBES.dartPubCache, start: params }),
    miseVersions: runExploreProbe({ probe: EXPLORE_PROBES.miseVersions, start: params }),
  };
}

function buildExploreProbe<T>(params: {
  definition: ExploreProbeDefinition<T>;
  isActiveXcodeRequired: boolean;
  buildFindings: (probed: { run: ExploreProbeRun; output: T }) => ExploreFinding[];
}): ExploreProbe {
  return {
    toolName: params.definition.toolName,
    isActiveXcodeRequired: params.isActiveXcodeRequired,
    loadFindings: async (run) => {
      const output = await loadProbeOutput({
        probe: params.definition,
        tool: run.tool,
        environment: run.environment,
        timeoutMs: run.timeoutMs,
      });

      if (output.kind === 'failed') {
        return output;
      }

      return { kind: 'succeeded', value: params.buildFindings({ run: run, output: output.value }) };
    },
  };
}

async function runExploreProbe(params: {
  probe: ExploreProbe;
  start: ExploreProbeStart;
}): Promise<ExploreProbeOutcome> {
  const start = params.start;
  // The processes are read before any tool starts, or a probe's own tool would show as running.
  const processCommands = await start.processCommands;

  if (params.probe.isActiveXcodeRequired && (await start.activeXcodeBundlePath) === null) {
    return { kind: 'toolMissing' };
  }

  const found = await findTrustedTool({
    name: params.probe.toolName,
    locations: start.toolInstallLocations[params.probe.toolName],
    homeDir: start.environment.homeDir,
    userId: start.environment.userId,
  });

  if (found.kind === 'failed') {
    switch (found.failure.reason) {
      case 'notFound':
        return { kind: 'toolMissing' };
      case 'untrusted':
        return { kind: 'toolUntrusted', failure: found.failure };
    }
  }

  const findings = await params.probe.loadFindings({
    tool: found.value,
    environment: start.environment,
    processCommands: processCommands,
    timeoutMs: start.timeoutMs,
  });

  if (findings.kind === 'failed') {
    return { kind: 'failed', tool: found.value, failure: findings.failure };
  }

  return { kind: 'probed', findings: findings.value };
}
