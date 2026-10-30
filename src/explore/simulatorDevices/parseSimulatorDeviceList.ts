import { isAbsolute } from 'node:path';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../parseJsonValue.js';

/** One device of `simctl list devices --json`, with the runtime it was listed under. */
export type SimulatorDevice = {
  udid: string;
  name: string;
  runtimeId: string;
  /** Such as `Shutdown` or `Booted`. */
  state: string;
  isAvailable: boolean;
  /** Why the device is unavailable, as `simctl` words it; `null` when it gives no reason. */
  availabilityError: string | null;
  dataPath: string;
  /** `null` when the device was never booted. */
  lastBootedAt: string | null;
};

export const SIMULATOR_DEVICE_LIST_ARGS = ['simctl', 'list', 'devices', '--json'];

// The UDID becomes an argument of `simctl delete`, so only the shape `simctl` prints passes.
const UDID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

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

  for (const [runtimeId, runtimeDevices] of Object.entries(json.value.devices)) {
    if (!Array.isArray(runtimeDevices)) {
      return { kind: 'failed', failure: 'the devices of a runtime are no list' };
    }

    for (const value of runtimeDevices) {
      const device = parseSimulatorDevice({ value: value, runtimeId: runtimeId });

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
  runtimeId: string;
}): SimulatorDevice | null {
  const value = params.value;

  if (!isJsonObject(value)) {
    return null;
  }

  const udid = value.udid;
  const name = value.name;
  const state = value.state;
  const isAvailable = value.isAvailable;
  const dataPath = value.dataPath;
  const availabilityError = value.availabilityError ?? null;
  const lastBootedAt = value.lastBootedAt ?? null;

  if (
    typeof udid !== 'string' ||
    !UDID_PATTERN.test(udid) ||
    typeof name !== 'string' ||
    typeof state !== 'string' ||
    typeof isAvailable !== 'boolean' ||
    typeof dataPath !== 'string' ||
    !isAbsolute(dataPath) ||
    (availabilityError !== null && typeof availabilityError !== 'string') ||
    (lastBootedAt !== null && typeof lastBootedAt !== 'string')
  ) {
    return null;
  }

  return {
    udid: udid,
    name: name,
    runtimeId: params.runtimeId,
    state: state,
    isAvailable: isAvailable,
    availabilityError: availabilityError,
    dataPath: dataPath,
    lastBootedAt: lastBootedAt,
  };
}
