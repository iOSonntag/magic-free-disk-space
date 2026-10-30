import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';

declare const simulatorDeviceUdidBrand: unique symbol;

/** A UDID that `parseSimulatorDeviceUdid` checked: a UUID, so it never reads as an option. */
export type SimulatorDeviceUdid = string & { [simulatorDeviceUdidBrand]: true };

/** One device of `simctl list devices --json`, with the runtime it was listed under. */
export type SimulatorDevice = {
  udid: SimulatorDeviceUdid;
  name: string;
  /** Such as `com.apple.CoreSimulator.SimRuntime.iOS-18-2`, the key it is listed under. */
  runtimeIdentifier: string;
  /** Such as `Shutdown` or `Booted`. */
  state: string;
  isAvailable: boolean;
  /** Why the device is unavailable, as `simctl` words it; `null` when it gives no reason. */
  availabilityError: string | null;
  dataPath: AbsolutePath;
};

export const SIMULATOR_DEVICE_LIST_PROBE: ExploreProbeDefinition<SimulatorDevice[]> = {
  toolName: 'xcrun',
  args: ['simctl', 'list', 'devices', '--json'],
  parse: parseSimulatorDeviceList,
};

// The UDID becomes an argument of `simctl delete`, so only the shape `simctl` prints passes.
const UDID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

/** The one maker of a `SimulatorDeviceUdid`; fails for any text but a UUID. */
export function parseSimulatorDeviceUdid(params: {
  text: string;
}): Result<SimulatorDeviceUdid, string> {
  if (!UDID_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a UUID' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as SimulatorDeviceUdid };
}

/** Parses the JSON of `simctl list devices --json`; fails with a reason on any other shape. */
export function parseSimulatorDeviceList(params: {
  stdoutText: string;
}): Result<SimulatorDevice[], string> {
  const json = parseJsonValue({ text: params.stdoutText });

  if (json.kind === 'failed') {
    return json;
  }

  if (!isJsonObject(json.value) || !isJsonObject(json.value.devices)) {
    return { kind: 'failed', failure: 'no "devices" object' };
  }

  const devices: SimulatorDevice[] = [];

  for (const [runtimeIdentifier, runtimeDevices] of Object.entries(json.value.devices)) {
    if (!Array.isArray(runtimeDevices)) {
      return { kind: 'failed', failure: 'the devices of a runtime are no list' };
    }

    for (const value of runtimeDevices) {
      const device = parseSimulatorDevice({ value: value, runtimeIdentifier: runtimeIdentifier });

      if (device === null) {
        return { kind: 'failed', failure: 'a device lacks a field or has a malformed one' };
      }

      devices.push(device);
    }
  }

  return { kind: 'succeeded', value: devices };
}

function parseSimulatorDevice(params: {
  value: unknown;
  runtimeIdentifier: string;
}): SimulatorDevice | null {
  const value = params.value;

  if (!isJsonObject(value)) {
    return null;
  }

  const udidText = value.udid;
  const name = value.name;
  const state = value.state;
  const isAvailable = value.isAvailable;
  const dataPathText = value.dataPath;
  const availabilityError = value.availabilityError ?? null;

  if (
    typeof udidText !== 'string' ||
    typeof name !== 'string' ||
    typeof state !== 'string' ||
    typeof isAvailable !== 'boolean' ||
    typeof dataPathText !== 'string' ||
    (availabilityError !== null && typeof availabilityError !== 'string')
  ) {
    return null;
  }

  const udid = parseSimulatorDeviceUdid({ text: udidText });
  const dataPath = parseAbsolutePath({ text: dataPathText });

  if (udid.kind === 'failed' || dataPath.kind === 'failed') {
    return null;
  }

  return {
    udid: udid.value,
    name: name,
    runtimeIdentifier: params.runtimeIdentifier,
    state: state,
    isAvailable: isAvailable,
    availabilityError: availabilityError,
    dataPath: dataPath.value,
  };
}
