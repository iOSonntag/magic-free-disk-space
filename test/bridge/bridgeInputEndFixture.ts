import { createBridgeIo } from '../../src/bridge/bridgeIo.js';
import { stopRunningToolsOnProcessEnd } from '../../src/tools/runToolCommand.js';
import { hostPlatform } from '../support/platformFixtures.js';

/** The line the fixture writes once its input ended, before it releases its listeners. */
export const INPUT_ENDED_LINE = 'input ended';

/**
 * Reads the bridge's input to its end under the process-end listeners of the host, as
 * `bridgeMain.ts` does, then releases them; the process must then end on its own.
 */
async function readInputToEnd(): Promise<void> {
  const releaseProcessEnd = stopRunningToolsOnProcessEnd({
    processEndSignals: hostPlatform.tools.processEndSignals,
  });

  try {
    const requestCount = await countRequestLines();

    process.stdout.write(`${INPUT_ENDED_LINE} after ${requestCount} requests\n`);
  } finally {
    releaseProcessEnd();
  }
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
