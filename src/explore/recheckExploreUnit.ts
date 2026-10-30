import type { Environment } from '../environment/buildEnvironment.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { isDartGcSetOffered } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import type { UnitActivityFacts } from './decideUnitActivity.js';
import { decideUnitActivity } from './decideUnitActivity.js';
import type {
  ExploreToolFailure,
  ExploreToolUnit,
  ExploreToolUnitDartPubCache,
  ExploreToolUnitMiseVersion,
  ExploreToolUnitSimulatorDevice,
} from './exploreUnit.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import type { MisePrunableVersion } from './miseVersions/parseMisePrunableVersions.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { isSimulatorDeviceOffered } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import type { SimulatorDevice } from './simulatorDevices/parseSimulatorDeviceList.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';

export type UnitRecheckUnchanged = { kind: 'unchanged' };

export type UnitRecheckChanged = { kind: 'changed' };

/** The unit's tool or app works on it now, or its busy rule could not read the processes. */
export type UnitRecheckBusy = { kind: 'busy' };

export type UnitRecheckFailed = { kind: 'failed'; failure: ExploreToolFailure };

export type UnitRecheck =
  | UnitRecheckUnchanged
  | UnitRecheckChanged
  | UnitRecheckBusy
  | UnitRecheckFailed;

/** The answer of a comparison of a fresh probe with the unit. */
export type UnitComparison = UnitRecheckUnchanged | UnitRecheckChanged | UnitRecheckBusy;

/**
 * Runs the unit's probe again with `tool`, the unit's tool as `loadTrustedTool` just returned it,
 * and compares its answer with the unit, right before its command. Never rejects.
 */
export async function recheckExploreUnit(params: {
  unit: ExploreToolUnit;
  tool: LocatedTool;
  environment: Environment;
  processCommands: string[] | null;
  timeoutMs: number;
}): Promise<UnitRecheck> {
  const probeRun = {
    tool: params.tool,
    environment: params.environment,
    timeoutMs: params.timeoutMs,
  };

  switch (params.unit.kind) {
    case 'simulatorDevice': {
      const devices = await loadProbeOutput({ ...probeRun, probe: SIMULATOR_DEVICE_LIST_PROBE });

      if (devices.kind === 'failed') {
        return devices;
      }

      return compareSimulatorDevice({
        unit: params.unit,
        devices: devices.value,
        processCommands: params.processCommands,
      });
    }
    case 'dartPubCache': {
      const gcPaths = await loadProbeOutput({
        ...probeRun,
        probe: DART_PUB_CACHE_GC_DRY_RUN_PROBE,
      });

      if (gcPaths.kind === 'failed') {
        return gcPaths;
      }

      return compareDartPubCache({
        unit: params.unit,
        gcPaths: gcPaths.value,
        processCommands: params.processCommands,
      });
    }
    case 'miseVersion': {
      const versions = await loadProbeOutput({ ...probeRun, probe: MISE_PRUNABLE_LIST_PROBE });

      if (versions.kind === 'failed') {
        return versions;
      }

      return compareMiseVersion({
        unit: params.unit,
        versions: versions.value,
        processCommands: params.processCommands,
      });
    }
  }
}

/** Unchanged while the device is still listed at the same place and still offered. */
export function compareSimulatorDevice(params: {
  unit: ExploreToolUnitSimulatorDevice;
  devices: SimulatorDevice[];
  processCommands: string[] | null;
}): UnitComparison {
  const device = params.devices.find((listed) => listed.udid === params.unit.udid);

  if (
    device === undefined ||
    device.dataPath !== params.unit.dataPath ||
    !isSimulatorDeviceOffered(device)
  ) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'simulatorDevice', state: device.state },
    processCommands: params.processCommands,
  });
}

/** Unchanged while the fresh gc set is still offered and holds no path the unit lacks. */
export function compareDartPubCache(params: {
  unit: ExploreToolUnitDartPubCache;
  gcPaths: AbsolutePath[];
  processCommands: string[] | null;
}): UnitComparison {
  const scannedPaths = new Set(params.unit.gcPaths);

  if (
    !isDartGcSetOffered(params.gcPaths) ||
    params.gcPaths.some((path) => !scannedPaths.has(path))
  ) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'dartPubCache' },
    processCommands: params.processCommands,
  });
}

/** Unchanged while the version is still prunable at the same install path. */
export function compareMiseVersion(params: {
  unit: ExploreToolUnitMiseVersion;
  versions: MisePrunableVersion[];
  processCommands: string[] | null;
}): UnitComparison {
  const stillPrunable = params.versions.some(
    (version) =>
      version.miseToolName === params.unit.miseToolName &&
      version.version === params.unit.version &&
      version.installPath === params.unit.installPath,
  );

  if (!stillPrunable) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'miseVersion' },
    processCommands: params.processCommands,
  });
}

/** An unknown activity counts as busy, so a unit runs only when its rule saw it idle. */
function decideComparisonActivity(params: {
  facts: UnitActivityFacts;
  processCommands: string[] | null;
}): UnitComparison {
  const activity = decideUnitActivity(params);

  switch (activity) {
    case 'idle':
      return { kind: 'unchanged' };
    case 'busy':
    case 'unknown':
      return { kind: 'busy' };
  }
}
