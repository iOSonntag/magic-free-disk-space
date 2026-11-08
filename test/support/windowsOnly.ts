import { describe, test } from 'bun:test';

/** Runs only on Windows a test that calls Win32 through bun:ffi or needs NTFS. */
export const testOnWindows = test.skipIf(process.platform !== 'win32');

/** Runs only on Windows a suite that calls Win32 through bun:ffi or needs NTFS. */
export const describeOnWindows = describe.skipIf(process.platform !== 'win32');
