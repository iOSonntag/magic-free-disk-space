import { createBridgeIo } from '../../src/bridge/bridgeIo.js';
import { runStoppingToolsOnProcessEnd } from '../../src/tools/runToolCommand.js';
import { hostPlatform } from '../support/platformFixtures.js';

/** The line the fixture writes once its input ended, before it releases its listeners. */
export const INPUT_ENDED_LINE = 'input ended';

/**
 * Reads the bridge's input to its end under the process-end listeners of the host, as
 * `bridgeMain.ts` does, which are then removed; the process must then end on its own.
 */
function readInputToEnd(): Promise<void> {
  return runStoppingToolsOnProcessEnd({
    processEndSignals: hostPlatform.tools.processEndSignals,
    run: async () => {
      const requestCount = await countRequestLines();

      process.stdout.write(`${INPUT_ENDED_LINE} after ${requestCount} requests\n`);
    },
  });
}

/** The nonblank lines of the bridge's input, counted once it ended. */
async function countRequestLines(): Promise<number> {
  let requestCount = 0;

  for await (const line of createBridgeIo().readLines()) {
    if (line.trim() !== '') {
      requestCount += 1;
    }
  }

  return requestCount;
}

if (import.meta.main) {
  await readInputToEnd();
}
