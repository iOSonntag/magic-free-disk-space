import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { EXIT_CODES } from './cli/exitCodes.js';
import { runCli } from './cli/runCli.js';
import type { TerminalIo } from './cli/terminalIo.js';
import { createTerminalIo } from './cli/terminalIo.js';
import { loadEnvironment } from './environment/loadEnvironment.js';
import { parsePlatformId } from './platform/platform.js';
import {
  formatEnvironmentFailure,
  formatUnsupportedPlatform,
} from './report/formatEnvironmentFailure.js';
import { stopRunningToolsOnProcessEnd } from './tools/runToolCommand.js';
import { TOOL_INSTALL_LOCATIONS } from './tools/toolInstallLocations.js';

async function main(): Promise<number> {
  const io = createTerminalIo();
  const platformId = parsePlatformId({ text: process.platform });

  if (platformId.kind === 'failed') {
    return refuseUnsupportedPlatform({ io: io });
  }

  switch (platformId.value) {
    case 'darwin':
      return runCliOnDarwin({ io: io });
    case 'win32':
      return refuseUnsupportedPlatform({ io: io });
  }
}

async function runCliOnDarwin(params: { io: TerminalIo }): Promise<number> {
  const environmentResult = await loadEnvironment();

  if (environmentResult.kind === 'failed') {
    params.io.writeError(`${formatEnvironmentFailure({ failure: environmentResult.failure })}\n`);

    return EXIT_CODES.cannotStart;
  }

  return runCli({
    argv: process.argv.slice(2),
    environment: environmentResult.value,
    catalogEntries: CATALOG_ENTRIES,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS,
    io: params.io,
  });
}

function refuseUnsupportedPlatform(params: { io: TerminalIo }): number {
  params.io.writeError(`${formatUnsupportedPlatform()}\n`);

  return EXIT_CODES.cannotStart;
}

stopRunningToolsOnProcessEnd({
  signalExitCodes: {
    SIGHUP: EXIT_CODES.hungUp,
    SIGINT: EXIT_CODES.interrupted,
    SIGQUIT: EXIT_CODES.quit,
    SIGTERM: EXIT_CODES.terminated,
  },
});

process.exitCode = await main();
