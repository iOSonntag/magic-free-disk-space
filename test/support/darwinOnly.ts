import { describe, test } from 'bun:test';

/** Runs only on macOS a test that needs a place, a catalog entry or a tool only macOS has. */
export const testOnDarwin = test.skipIf(process.platform !== 'darwin');

/** Runs only on macOS a suite that needs a place, a catalog entry or a tool only macOS has. */
export const describeOnDarwin = describe.skipIf(process.platform !== 'darwin');
