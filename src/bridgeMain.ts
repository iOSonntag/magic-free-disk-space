import { createBridgeIo } from './bridge/bridgeIo.js';
import { runBridge } from './bridge/runBridge.js';
import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { loadEnvironment } from './environment/loadEnvironment.js';
import { stopRunningTools } from './tools/runToolCommand.js';
import { TOOL_INSTALL_LOCATIONS } from './tools/toolInstallLocations.js';

const DONE_EXIT_CODE = 0;

const CANNOT_START_EXIT_CODE = 2;

/** 128 plus the number of the signal, as a shell reports a process that SIGINT ended. */
const INTERRUPTED_EXIT_CODE = 130;

/** 128 plus the number of SIGTERM. */
const TERMINATED_EXIT_CODE = 143;

async function main(): Promise<number> {
  const end = await runBridge({
    io: createBridgeIo(),
    catalogEntries: CATALOG_ENTRIES,
    toolInstallLocations: TOOL_INSTALL_LOCATIONS,
    loadEnvironment: loadEnvironment,
    clock: () => Date.now(),
  });

  switch (end) {
    case 'inputEnded':
      return DONE_EXIT_CODE;
    case 'cannotStart':
      return CANNOT_START_EXIT_CODE;
  }
}

// A tool runs in its own process group, which outlives this process unless it is stopped here.
process.on('exit', () => {
  stopRunningTools();
});
process.on('SIGINT', () => {
  stopRunningTools();
  process.exit(INTERRUPTED_EXIT_CODE);
});
process.on('SIGTERM', () => {
  stopRunningTools();
  process.exit(TERMINATED_EXIT_CODE);
});

process.exitCode = await main();
