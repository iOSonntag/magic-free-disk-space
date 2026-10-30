import { dirname } from 'node:path';
import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import { formatSimulatorRuntimeName } from '../simulatorRuntimes/formatSimulatorRuntimeName.js';
import type { SimulatorDevice } from './parseSimulatorDeviceList.js';

/**
 * A device is offered only when its runtime is gone: neither `simctl` nor the device files tell
 * whether an available device is in use.
 */
export function isSimulatorDeviceOffered(device: SimulatorDevice): boolean {
  return !device.isAvailable;
}

export function buildSimulatorDeviceFindings(params: {
  tool: LocatedTool;
  devices: SimulatorDevice[];
  processCommands: string[] | null;
}): ExploreFinding[] {
  return params.devices.filter(isSimulatorDeviceOffered).map((device) => {
    const runtimeName = formatSimulatorRuntimeName({ runtimeIdentifier: device.runtimeIdentifier });
    const finding: ExploreFinding = {
      unit: {
        kind: 'simulatorDevice',
        tool: params.tool,
        udid: device.udid,
        dataPath: device.dataPath,
      },
      title: `Simulator ${device.name} (${runtimeName})`,
      explanation: 'A simulator device with the apps and data installed in it.',
      regeneration:
        'A deleted simulator does not come back; Xcode creates a new, empty one when you add it.',
      risk: 'review',
      evidenceLines: buildSimulatorDeviceEvidenceLines({ device: device }),
      displayPath: dirname(device.dataPath),
      activity: decideUnitActivity({
        facts: { kind: 'simulatorDevice', state: device.state },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });
}

function buildSimulatorDeviceEvidenceLines(params: { device: SimulatorDevice }): string[] {
  const runtimeLine = `Its runtime ${params.device.runtimeIdentifier} is no longer installed.`;

  if (params.device.availabilityError === null) {
    return [runtimeLine];
  }

  return [runtimeLine, `Simulator reports: ${params.device.availabilityError}`];
}
