import type { ExploreProbeId } from '../catalog/catalog.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import type { LocatedTool, ToolLookupFailureUntrusted } from '../tools/findTrustedTool.js';
import { findTrustedTool } from '../tools/findTrustedTool.js';
import type { ToolInstallLocations, ToolName } from '../tools/toolInstallLocations.js';
import { buildDartPubCacheFindings } from './dartPubCache/buildDartPubCacheFindings.js';
import {
  DART_PUB_CACHE_GC_DRY_RUN_ARGS,
  parseDartPubCacheGc,
} from './dartPubCache/parseDartPubCacheGc.js';
import type { ExploreFinding, ExploreToolFailure } from './exploreUnit.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { buildMiseVersionFindings } from './miseVersions/buildMiseVersionFindings.js';
import {
  MISE_PRUNABLE_LIST_ARGS,
  parseMisePrunableVersions,
} from './miseVersions/parseMisePrunableVersions.js';
import { buildSimulatorDeviceFindings } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import {
  parseSimulatorDeviceList,
  SIMULATOR_DEVICE_LIST_ARGS,
} from './simulatorDevices/parseSimulatorDeviceList.js';

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

type ExploreProbeRun = {
  tool: LocatedTool;
  environment: Environment;
  processCommands: Promise<string[] | null>;
  timeoutMs: number;
};

type ExploreProbe = {
  toolName: ToolName;
  loadFindings: (run: ExploreProbeRun) => Promise<Result<ExploreFinding[], ExploreToolFailure>>;
};

const EXPLORE_PROBES: Record<ExploreProbeId, ExploreProbe> = {
  simulatorDevices: { toolName: 'xcrun', loadFindings: loadSimulatorDeviceFindings },
  dartPubCache: { toolName: 'dart', loadFindings: loadDartPubCacheFindings },
  miseVersions: { toolName: 'mise', loadFindings: loadMiseVersionFindings },
};

/**
 * Starts every probe at once and never rejects: each promise ends in an outcome. The activity of
 * each finding comes from `decideUnitActivity`, so `null` processes leave `unknown` only units
 * whose busy rule reads processes.
 */
export function startExploreProbes(params: {
  environment: Environment;
  toolInstallLocations: ToolInstallLocations;
  processCommands: Promise<string[] | null>;
  timeoutMs: number;
}): Record<ExploreProbeId, Promise<ExploreProbeOutcome>> {
  return {
    simulatorDevices: runExploreProbe({ probe: EXPLORE_PROBES.simulatorDevices, ...params }),
    dartPubCache: runExploreProbe({ probe: EXPLORE_PROBES.dartPubCache, ...params }),
    miseVersions: runExploreProbe({ probe: EXPLORE_PROBES.miseVersions, ...params }),
  };
}

async function runExploreProbe(params: {
  probe: ExploreProbe;
  environment: Environment;
  toolInstallLocations: ToolInstallLocations;
  processCommands: Promise<string[] | null>;
  timeoutMs: number;
}): Promise<ExploreProbeOutcome> {
  const found = await findTrustedTool({
    name: params.probe.toolName,
    locations: params.toolInstallLocations[params.probe.toolName],
    homeDir: params.environment.homeDir,
    userId: params.environment.userId,
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
    environment: params.environment,
    processCommands: params.processCommands,
    timeoutMs: params.timeoutMs,
  });

  if (findings.kind === 'failed') {
    return { kind: 'failed', tool: found.value, failure: findings.failure };
  }

  return { kind: 'probed', findings: findings.value };
}

async function loadSimulatorDeviceFindings(
  run: ExploreProbeRun,
): Promise<Result<ExploreFinding[], ExploreToolFailure>> {
  const devices = await loadProbeOutput({
    tool: run.tool,
    args: SIMULATOR_DEVICE_LIST_ARGS,
    parse: parseSimulatorDeviceList,
    environment: run.environment,
    timeoutMs: run.timeoutMs,
  });

  if (devices.kind === 'failed') {
    return devices;
  }

  const findings = buildSimulatorDeviceFindings({
    tool: run.tool,
    devices: devices.value,
    processCommands: await run.processCommands,
  });

  return { kind: 'succeeded', value: findings };
}

async function loadDartPubCacheFindings(
  run: ExploreProbeRun,
): Promise<Result<ExploreFinding[], ExploreToolFailure>> {
  const gcPaths = await loadProbeOutput({
    tool: run.tool,
    args: DART_PUB_CACHE_GC_DRY_RUN_ARGS,
    parse: parseDartPubCacheGc,
    environment: run.environment,
    timeoutMs: run.timeoutMs,
  });

  if (gcPaths.kind === 'failed') {
    return gcPaths;
  }

  const findings = buildDartPubCacheFindings({
    tool: run.tool,
    gcPaths: gcPaths.value,
    homeDir: run.environment.homeDir,
    processCommands: await run.processCommands,
  });

  return { kind: 'succeeded', value: findings };
}

async function loadMiseVersionFindings(
  run: ExploreProbeRun,
): Promise<Result<ExploreFinding[], ExploreToolFailure>> {
  const versions = await loadProbeOutput({
    tool: run.tool,
    args: MISE_PRUNABLE_LIST_ARGS,
    parse: parseMisePrunableVersions,
    environment: run.environment,
    timeoutMs: run.timeoutMs,
  });

  if (versions.kind === 'failed') {
    return versions;
  }

  const findings = buildMiseVersionFindings({
    tool: run.tool,
    versions: versions.value,
    homeDir: run.environment.homeDir,
    processCommands: await run.processCommands,
  });

  return { kind: 'succeeded', value: findings };
}
