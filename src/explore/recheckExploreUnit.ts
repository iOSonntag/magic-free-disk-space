import type { Environment } from '../environment/buildEnvironment.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { recheckAndroidAvdUnit } from './android/recheckAndroidAvdUnit.js';
import { recheckAndroidPackageUnit } from './android/recheckAndroidPackageUnit.js';
import { recheckAndroidPlatformUnit } from './android/recheckAndroidPlatformUnit.js';
import { recheckAsdfVersionUnit } from './asdfVersions/recheckAsdfVersionUnit.js';
import { recheckClaudeCodeVersionUnit } from './claudeCodeVersions/recheckClaudeCodeVersionUnit.js';
import { recheckClaudeTranscriptsUnit } from './claudeTranscripts/recheckClaudeTranscriptsUnit.js';
import { recheckCondaUnit } from './condaPackages/recheckCondaUnit.js';
import { isDartGcSetOffered } from './dartPubCache/buildDartPubCacheFindings.js';
import { DART_PUB_CACHE_GC_DRY_RUN_PROBE } from './dartPubCache/parseDartPubCacheGc.js';
import type { PathUnitRecheck, UnitComparison, UnitRecheck } from './decideComparisonActivity.js';
import { decideComparisonActivity } from './decideComparisonActivity.js';
import { recheckDownloadsUnit } from './downloadsInstallers/recheckDownloadsUnit.js';
import type { ExploreProbePlatform, ExploreUnitRecheckRun } from './exploreProbe.js';
import type {
  ExplorePathUnit,
  ExploreToolUnit,
  ExploreToolUnitDartPubCache,
  ExploreToolUnitMiseVersion,
  ExploreToolUnitSimulatorDevice,
} from './exploreUnit.js';
import { recheckFvmVersionUnit } from './fvmVersions/recheckFvmVersionUnit.js';
import { recheckHomebrewUnit } from './homebrew/recheckHomebrewUnit.js';
import { recheckHuggingFaceUnit } from './huggingFace/recheckHuggingFaceUnit.js';
import { recheckIdeVersionUnit } from './ideVersions/recheckIdeVersionUnit.js';
import { recheckLmStudioModelUnit } from './lmStudioModels/recheckLmStudioModelUnit.js';
import { loadProbeOutput } from './loadProbeOutput.js';
import { recheckMailDownloadsUnit } from './mailDownloads/recheckMailDownloadsUnit.js';
import type { MisePrunableVersion } from './miseVersions/parseMisePrunableVersions.js';
import { MISE_PRUNABLE_LIST_PROBE } from './miseVersions/parseMisePrunableVersions.js';
import { recheckNvmVersionUnit } from './nvmVersions/recheckNvmVersionUnit.js';
import { recheckOllamaModelUnit } from './ollamaModels/recheckOllamaModelUnit.js';
import { recheckPnpmStoreUnit } from './pnpmStores/recheckPnpmStoreUnit.js';
import { recheckRustupToolchainUnit } from './rustupToolchains/recheckRustupToolchainUnit.js';
import { isSimulatorDeviceOffered } from './simulatorDevices/buildSimulatorDeviceFindings.js';
import type { SimulatorDevice } from './simulatorDevices/parseSimulatorDeviceList.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from './simulatorDevices/parseSimulatorDeviceList.js';
import { recheckSimulatorRuntimeUnit } from './simulatorRuntimes/recheckSimulatorRuntimeUnit.js';
import { recheckVagrantBoxUnit } from './vagrantBoxes/recheckVagrantBoxUnit.js';
import { compareVscodeExtensionUnit } from './vscodeExtensions/compareVscodeExtensionUnit.js';
import { loadVscodeExtensionState } from './vscodeExtensions/loadVscodeExtensionState.js';

/**
 * Runs the unit's probe again with `tool`, the unit's tool as `loadTrustedTool` just returned it,
 * within `timeoutMs` for all its commands, and compares its answer with the unit, right before
 * its command. Never rejects.
 */
export async function recheckExploreUnit(params: {
  unit: ExploreToolUnit;
  tool: LocatedTool;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
  timeoutMs: number;
}): Promise<UnitRecheck> {
  const run: ExploreUnitRecheckRun = {
    tool: params.tool,
    environment: params.environment,
    platform: params.platform,
    deadlineMs: Date.now() + params.timeoutMs,
    processCommands: params.processCommands,
  };

  switch (params.unit.kind) {
    case 'simulatorDevice': {
      const devices = await loadProbeOutput({ ...run, probe: SIMULATOR_DEVICE_LIST_PROBE });

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
      const gcPaths = await loadProbeOutput({ ...run, probe: DART_PUB_CACHE_GC_DRY_RUN_PROBE });

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
      const versions = await loadProbeOutput({ ...run, probe: MISE_PRUNABLE_LIST_PROBE });

      if (versions.kind === 'failed') {
        return versions;
      }

      return compareMiseVersion({
        unit: params.unit,
        versions: versions.value,
        processCommands: params.processCommands,
      });
    }
    case 'simulatorRuntime':
      return recheckSimulatorRuntimeUnit({ unit: params.unit, run: run });
    case 'androidAvd':
      return recheckAndroidAvdUnit({ unit: params.unit, run: run });
    case 'homebrewOldVersions':
    case 'homebrewOrphans':
      return recheckHomebrewUnit({ unit: params.unit, run: run });
    case 'asdfVersion':
      return recheckAsdfVersionUnit({ unit: params.unit, run: run });
    case 'vagrantBoxVersion':
      return recheckVagrantBoxUnit({ unit: params.unit, run: run });
    case 'rustupToolchain':
      return recheckRustupToolchainUnit({ unit: params.unit, run: run });
    case 'condaTarballs':
    case 'condaPackages':
      return recheckCondaUnit({ unit: params.unit, run: run });
  }
}

/**
 * Reads the state of the unit's probe again and compares it with the unit, right before its
 * folder is deleted. A failed read returns the loader's failure as it is. Never rejects.
 */
export async function recheckExplorePathUnit(params: {
  unit: ExplorePathUnit;
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
}): Promise<PathUnitRecheck> {
  switch (params.unit.kind) {
    case 'androidSystemImage':
    case 'androidEmulator':
      return recheckAndroidPackageUnit({ ...params, unit: params.unit });
    case 'vscodeExtension': {
      const state = await loadVscodeExtensionState({
        pathRules: params.environment.pathRules,
        homeDir: params.environment.homeDir,
        privacyDenialCode: params.platform.privacyDenialCode,
      });

      if (state.kind === 'failed') {
        return state;
      }

      return compareVscodeExtensionUnit({
        unit: params.unit,
        state: state.value,
        processCommands: params.processCommands,
      });
    }
    case 'nvmVersion':
      return recheckNvmVersionUnit({ ...params, unit: params.unit });
    case 'androidPlatform':
      return recheckAndroidPlatformUnit({ ...params, unit: params.unit });
    case 'pnpmStore':
      return recheckPnpmStoreUnit({ ...params, unit: params.unit });
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
      return recheckDownloadsUnit({ ...params, unit: params.unit });
    case 'mailDownloads':
      return recheckMailDownloadsUnit({ ...params, unit: params.unit });
    case 'ollamaModel':
      return recheckOllamaModelUnit({ ...params, unit: params.unit });
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'huggingFacePartialDownloads':
      return recheckHuggingFaceUnit({ ...params, unit: params.unit });
    case 'claudeTranscripts':
      return recheckClaudeTranscriptsUnit({ ...params, unit: params.unit });
    case 'claudeCodeVersion':
      return recheckClaudeCodeVersionUnit({ ...params, unit: params.unit });
    case 'ideVersionFolder':
      return recheckIdeVersionUnit({ ...params, unit: params.unit });
    case 'lmStudioModel':
      return recheckLmStudioModelUnit({ ...params, unit: params.unit });
    case 'fvmVersion':
      return recheckFvmVersionUnit({ ...params, unit: params.unit });
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
