import { describe } from 'bun:test';

/**
 * Skips on Windows a suite whose code runs on macOS alone until `platform/win32` lands; the layer
 * that adds that platform deletes this file.
 */
export const describeAwaitingWin32Platform = describe.skipIf(process.platform === 'win32');
