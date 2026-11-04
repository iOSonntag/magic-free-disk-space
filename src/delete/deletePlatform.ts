import type { Result } from '../result.js';

/** What the deletion takes from the operating system. */
export type DeletePlatform = {
  /**
   * Removes the entry at `path` with everything below it; a symbolic link or a junction inside is
   * removed itself, never its target. Fails with the system's error code. Never throws.
   */
  removeTree: (params: { path: string }) => Promise<Result<null, string>>;
};
