import type { UnitActivity } from './exploreUnit.js';

/** What a probe saw of a simulator device; `state` as `simctl` reports it, such as `Shutdown`. */
export type UnitActivityFactsSimulatorDevice = { kind: 'simulatorDevice'; state: string };

export type UnitActivityFactsDartPubCache = { kind: 'dartPubCache' };

export type UnitActivityFactsMiseVersion = { kind: 'miseVersion' };

/** The facts of a probe that the busy rule of each unit kind reads. */
export type UnitActivityFacts =
  | UnitActivityFactsSimulatorDevice
  | UnitActivityFactsDartPubCache
  | UnitActivityFactsMiseVersion;

const SIMULATOR_APP_EXECUTABLE_PATH_PART = '/Simulator.app/Contents/MacOS/Simulator';

const SIMULATOR_DEVICE_IDLE_STATE = 'Shutdown';

/**
 * The one busy rule of the explore units, at the scan and right before a run. `unknown` only for
 * a unit whose rule reads the processes while they are `null`.
 */
export function decideUnitActivity(params: {
  facts: UnitActivityFacts;
  processCommands: string[] | null;
}): UnitActivity {
  switch (params.facts.kind) {
    case 'simulatorDevice':
      return decideSimulatorDeviceActivity({
        state: params.facts.state,
        processCommands: params.processCommands,
      });
    case 'dartPubCache':
    case 'miseVersion':
      return 'idle';
  }
}

/** A device that is not shut down is in use; so is every device while Simulator.app runs. */
function decideSimulatorDeviceActivity(params: {
  state: string;
  processCommands: string[] | null;
}): UnitActivity {
  if (params.state !== SIMULATOR_DEVICE_IDLE_STATE) {
    return 'busy';
  }

  if (params.processCommands === null) {
    return 'unknown';
  }

  const simulatorAppRuns = params.processCommands.some((command) =>
    command.includes(SIMULATOR_APP_EXECUTABLE_PATH_PART),
  );

  return simulatorAppRuns ? 'busy' : 'idle';
}
