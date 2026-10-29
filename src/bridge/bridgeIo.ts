import type { BridgeIo } from './runBridge.js';

/** Reads the requests from stdin and writes each event as one line of JSON to stdout. */
export function createBridgeIo(): BridgeIo {
  return {
    readLines: () => console,
    writeEvent: (event) => {
      process.stdout.write(`${JSON.stringify(event)}\n`);
    },
  };
}
