import { runCli } from '../../src/cli/runCli.js';
import type { TerminalIo } from '../../src/cli/terminalIo.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { Platform } from '../../src/platform/platform.js';
import { PROTOCOL_FIXTURE_DISK } from './protocolFixtureScan.js';

/**
 * Runs the command line with `argv` on `environment` through the slices of `platform`, talking
 * through `io`, on a fixed disk so no test reads the volume it runs on; gives the exit code.
 */
export function runTestCli(params: {
  argv: string[];
  environment: Environment;
  platform: Platform;
  io: TerminalIo;
}): Promise<number> {
  return runCli({
    argv: params.argv,
    environment: params.environment,
    catalog: params.platform.catalog,
    tools: params.platform.tools,
    scan: params.platform.scan,
    system: { ...params.platform.system, loadVolumeSpace: async () => PROTOCOL_FIXTURE_DISK },
    delete: params.platform.delete,
    explore: params.platform.explore,
    texts: params.platform.report,
    io: params.io,
  });
}
