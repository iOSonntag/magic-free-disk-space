import { createConcurrencyLimit } from './createConcurrencyLimit.js';

// macOS gives a process 256 open files by default; 64 calls in flight stay well below it.
const MAX_CONCURRENT_FILESYSTEM_CALLS = 64;

/** Every filesystem read of the scan passes through here, so parallel walks stay bounded. */
export const runFilesystemCall = createConcurrencyLimit({
  maxConcurrent: MAX_CONCURRENT_FILESYSTEM_CALLS,
});
