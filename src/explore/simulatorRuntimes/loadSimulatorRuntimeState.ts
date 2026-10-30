import type { Result } from '../../result.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreToolFailure } from '../exploreUnit.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import type { SimulatorDevice } from '../simulatorDevices/parseSimulatorDeviceList.js';
import { SIMULATOR_DEVICE_LIST_PROBE } from '../simulatorDevices/parseSimulatorDeviceList.js';
import type { SimulatorRuntime } from './parseSimulatorRuntimeList.js';
import { SIMULATOR_RUNTIME_LIST_PROBE } from './parseSimulatorRuntimeList.js';

/** What `simctl runtime list -j` and `simctl list devices --json` answered. */
export type SimulatorRuntimeState = { runtimes: SimulatorRuntime[]; devices: SimulatorDevice[] };

/**
 * Runs the two read-only commands of the located `xcrun` once, each with the time left before the
 * run's deadline, for the probe and the recheck of its units. Fails with the runtime list's
 * failure first when both fail.
 */
export async function loadSimulatorRuntimeState(
  run: ExploreToolCommandRun,
): Promise<Result<SimulatorRuntimeState, ExploreToolFailure>> {
  const [runtimes, devices] = await Promise.all([
    loadProbeOutput({
      probe: SIMULATOR_RUNTIME_LIST_PROBE,
      tool: run.tool,
      environment: run.environment,
      deadlineMs: run.deadlineMs,
    }),
    loadProbeOutput({
      probe: SIMULATOR_DEVICE_LIST_PROBE,
      tool: run.tool,
      environment: run.environment,
      deadlineMs: run.deadlineMs,
    }),
  ]);

  if (runtimes.kind === 'failed') {
    return runtimes;
  }

  if (devices.kind === 'failed') {
    return devices;
  }

  return { kind: 'succeeded', value: { runtimes: runtimes.value, devices: devices.value } };
}
