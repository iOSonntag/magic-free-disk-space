import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import { formatSimulatorRuntimeName } from '../simulatorDevices/formatSimulatorRuntimeName.js';
import type { SimulatorDevice } from '../simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntimeState } from './loadSimulatorRuntimeState.js';
import type { SimulatorRuntime } from './parseSimulatorRuntimeList.js';

/** Whether an available device runs on the runtime of `runtimeIdentifier`. */
export function hasAvailableSimulatorDevice(params: {
  runtimeIdentifier: string;
  devices: SimulatorDevice[];
}): boolean {
  return params.devices.some(
    (device) => device.isAvailable && device.runtimeIdentifier === params.runtimeIdentifier,
  );
}

/**
 * A runtime is offered when it is deletable, its last use is known and older than the cutoff, and
 * no available device runs on it.
 */
export function isSimulatorRuntimeOffered(params: {
  runtime: SimulatorRuntime;
  devices: SimulatorDevice[];
  unusedCutoffMs: number;
}): boolean {
  if (!params.runtime.isDeletable || params.runtime.lastUsedAtMs === null) {
    return false;
  }

  if (params.runtime.lastUsedAtMs >= params.unusedCutoffMs) {
    return false;
  }

  return !hasAvailableSimulatorDevice({
    runtimeIdentifier: params.runtime.runtimeIdentifier,
    devices: params.devices,
  });
}

export function buildSimulatorRuntimeFindings(params: {
  tool: LocatedTool;
  state: SimulatorRuntimeState;
  unusedCutoffMs: number;
  processCommands: string[] | null;
}): ExploreFinding[] {
  const findings: ExploreFinding[] = [];

  for (const runtime of params.state.runtimes) {
    if (
      runtime.lastUsedAtMs === null ||
      !isSimulatorRuntimeOffered({
        runtime: runtime,
        devices: params.state.devices,
        unusedCutoffMs: params.unusedCutoffMs,
      })
    ) {
      continue;
    }

    const runtimeName = formatSimulatorRuntimeName({
      runtimeIdentifier: runtime.runtimeIdentifier,
    });
    const lastUsedDate = new Date(runtime.lastUsedAtMs).toISOString().slice(0, 10);

    findings.push({
      unit: {
        kind: 'simulatorRuntime',
        tool: params.tool,
        runtimeId: runtime.runtimeId,
        runtimeIdentifier: runtime.runtimeIdentifier,
        imagePath: runtime.imagePath,
        lastUsedAtMs: runtime.lastUsedAtMs,
      },
      title: `${runtimeName} simulator runtime`,
      explanation: 'A simulator runtime Xcode downloaded: the system image its simulators run on.',
      regeneration: 'Xcode downloads it again when you add a simulator of this version.',
      risk: 'review',
      evidenceLines: [`Last used on ${lastUsedDate}.`, 'No available simulator runs on it.'],
      displayPath: runtime.imagePath,
      activity: decideUnitActivity({
        facts: { kind: 'simulatorRuntime' },
        processCommands: params.processCommands,
      }),
    });
  }

  return findings;
}
