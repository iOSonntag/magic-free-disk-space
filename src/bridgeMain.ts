import { createBridgeIo } from './bridge/bridgeIo.js';
import { runBridge } from './bridge/runBridge.js';
import { CATALOG_ENTRIES } from './catalog/catalogEntries.js';
import { loadEnvironment } from './environment/loadEnvironment.js';

const DONE_EXIT_CODE = 0;

const CANNOT_START_EXIT_CODE = 2;

async function main(): Promise<number> {
  const end = await runBridge({
    io: createBridgeIo(),
    catalogEntries: CATALOG_ENTRIES,
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

process.exitCode = await main();
