import type { Result } from '../../result.js';

declare const simulatorRuntimeIdBrand: unique symbol;

/** A runtime id that `parseSimulatorRuntimeId` checked: a UUID, so it never reads as an option. */
export type SimulatorRuntimeId = string & { [simulatorRuntimeIdBrand]: true };

// The id becomes an argument of `simctl runtime delete`, so only the shape `simctl` prints passes.
const RUNTIME_ID_PATTERN =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

/** The one maker of a `SimulatorRuntimeId`; fails for any text but a UUID. */
export function parseSimulatorRuntimeId(params: {
  text: string;
}): Result<SimulatorRuntimeId, string> {
  if (!RUNTIME_ID_PATTERN.test(params.text)) {
    return { kind: 'failed', failure: 'not a UUID' };
  }

  // The brand records the check above, which the compiler cannot follow.
  return { kind: 'succeeded', value: params.text as SimulatorRuntimeId };
}
