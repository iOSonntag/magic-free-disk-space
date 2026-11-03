import { describe, test } from 'bun:test';

/** Skips on Windows a test that needs POSIX permissions, owners, symbolic links, signals or shell scripts. */
export const testOnPosix = test.skipIf(process.platform === 'win32');

/** Skips on Windows a suite that needs POSIX permissions, owners, symbolic links, signals or shell scripts. */
export const describeOnPosix = describe.skipIf(process.platform === 'win32');
