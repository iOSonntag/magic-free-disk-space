import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';

/** What the reads of `~/.vscode/extensions`, its registries, and `.obsolete` found. */
export type VscodeExtensionState = { folderNames: string[] };

/**
 * Reads the extension folders and every registry once, for the probe and the recheck of its units.
 * A read that is absent or unfit is a fact of the state; only a failed read fails.
 */
export function loadVscodeExtensionState(_params: {
  homeDir: string;
}): Promise<Result<VscodeExtensionState, ExploreFileUnreadable>> {
  throw new Error('loadVscodeExtensionState is not built yet (part 2B3)');
}
