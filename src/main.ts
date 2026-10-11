import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { EXIT_CODES } from './cli/exitCodes.js';
import { runCli } from './cli/runCli.js';
import { createTerminalIo } from './cli/terminalIo.js';
import { loadEnvironment } from './environment/loadEnvironment.js';

async function main(): Promise<number> {
  const io = createTerminalIo();
  const environmentResult = await loadEnvironment();

  if (environmentResult.kind === 'failed') {
    io.writeError(
      `Cannot resolve ${environmentResult.failure.path}: ${environmentResult.failure.code}\n`,
    );

    return EXIT_CODES.cannotStart;
  }

  return runCli({
    argv: process.argv.slice(2),
    environment: environmentResult.value,
    catalogEntries: CATALOG_ENTRIES,
    io: io,
  });
}

process.exitCode = await main();
