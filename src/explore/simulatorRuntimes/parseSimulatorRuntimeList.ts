import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { ExploreProbeDefinition } from '../loadProbeOutput.js';
import type { SimulatorRuntimeId } from './parseSimulatorRuntimeId.js';
import { parseSimulatorRuntimeId } from './parseSimulatorRuntimeId.js';

/** One runtime of `simctl runtime list -j`. */
export type SimulatorRuntime = {
  runtimeId: SimulatorRuntimeId;
  /** Such as `com.apple.CoreSimulator.SimRuntime.iOS-18-2`, the key of its devices. */
  runtimeIdentifier: string;
  /** The runtime's disk image. */
  imagePath: AbsolutePath;
  isDeletable: boolean;
  /** `null` when `simctl` reports no last use. */
  lastUsedAtMs: number | null;
};

export const SIMULATOR_RUNTIME_LIST_PROBE: ExploreProbeDefinition<SimulatorRuntime[]> = {
  toolName: 'xcrun',
  args: ['simctl', 'runtime', 'list', '-j'],
  parse: parseSimulatorRuntimeList,
};

// `simctl` prints UTC times such as `2025-01-02T03:04:05Z`, at times with a fraction of a second.
const LAST_USED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Parses the JSON of `simctl runtime list -j`; fails with a reason on any other shape. */
export function parseSimulatorRuntimeList(params: {
  stdoutText: string;
}): Result<SimulatorRuntime[], string> {
  const json = parseJsonValue({ text: params.stdoutText });

  if (json.kind === 'failed') {
    return json;
  }

  if (!isJsonObject(json.value)) {
    return { kind: 'failed', failure: 'no object of runtimes' };
  }

  const runtimes: SimulatorRuntime[] = [];

  for (const value of Object.values(json.value)) {
    const runtime = parseSimulatorRuntime({ value: value });

    if (runtime === null) {
      return { kind: 'failed', failure: 'a runtime lacks a field or has a malformed one' };
    }

    runtimes.push(runtime);
  }

  return { kind: 'succeeded', value: runtimes };
}

function parseSimulatorRuntime(params: { value: unknown }): SimulatorRuntime | null {
  const value = params.value;

  if (!isJsonObject(value)) {
    return null;
  }

  const identifierText = value.identifier;
  const runtimeIdentifier = value.runtimeIdentifier;
  const pathText = value.path;
  const isDeletable = value.deletable;
  const lastUsedAtText = value.lastUsedAt ?? null;

  if (
    typeof identifierText !== 'string' ||
    typeof runtimeIdentifier !== 'string' ||
    typeof pathText !== 'string' ||
    typeof isDeletable !== 'boolean' ||
    (lastUsedAtText !== null && typeof lastUsedAtText !== 'string')
  ) {
    return null;
  }

  const runtimeId = parseSimulatorRuntimeId({ text: identifierText });
  const imagePath = parseAbsolutePath({ text: pathText });
  const lastUsedAtMs = parseLastUsedAtMs({ text: lastUsedAtText });

  if (
    runtimeId.kind === 'failed' ||
    imagePath.kind === 'failed' ||
    lastUsedAtMs.kind === 'failed'
  ) {
    return null;
  }

  return {
    runtimeId: runtimeId.value,
    runtimeIdentifier: runtimeIdentifier,
    imagePath: imagePath.value,
    isDeletable: isDeletable,
    lastUsedAtMs: lastUsedAtMs.value,
  };
}

/** `null` for an absent last use; fails for any text but a UTC time in the form `simctl` prints. */
function parseLastUsedAtMs(params: { text: string | null }): Result<number | null, string> {
  if (params.text === null) {
    return { kind: 'succeeded', value: null };
  }

  const lastUsedAtMs = Date.parse(params.text);

  if (!LAST_USED_AT_PATTERN.test(params.text) || Number.isNaN(lastUsedAtMs)) {
    return { kind: 'failed', failure: 'not a UTC time' };
  }

  return { kind: 'succeeded', value: lastUsedAtMs };
}
