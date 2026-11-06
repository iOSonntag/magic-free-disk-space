import { stubPartNotBuilt } from '../../notBuilt.js';

/**
 * The version of macOS, such as `15.1`; `null` when it cannot be read. Never throws. Part 3b
 * builds it; until then it answers `null`, as an unreadable version does.
 */
export function loadSystemVersion(): Promise<string | null> {
  return Promise.resolve(stubPartNotBuilt<string | null>(null));
}
