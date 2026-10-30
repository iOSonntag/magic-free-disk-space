import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { EXIT_CODES } from './cli/exitCodes.js';
import { runCli } from './cli/runCli.js';
import { createTerminalIo } from './cli/terminalIo.js';
import { loadEnvironment } from './environment/loadEnvironment.js';
import { formatEnvironmentFailure } from './report/formatEnvironmentFailure.js';
import { TOOL_INSTALL_LOCATIONS } from './tools/toolInstallLocations.js';

async function main(): Promise<number> {
  const io = createTerminalIo();
  const environmentResult = await loadEnvironment();

  if (environmentResult.kind === 'failed') {
    io.writeError(`${formatEnvironmentFailure({ failure: environmentResult.failure })}\n`);

    return EXIT_CODES.cannotStart;
  }

  return runCli({
    argv: process.argv.slice(2),
    environment: environmentResult.value,
    catalogEntries: CATALOG_ENTRIES,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS,
    io: io,
  });
}

process.exitCode = await main();
