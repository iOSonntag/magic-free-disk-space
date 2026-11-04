import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { ProcessEndSignal } from './runToolCommand.js';
import type { ToolInstallLocations } from './toolInstallLocations.js';

/** A signal that ends the app on this platform, with the exit code it ends with. */
export type ProcessEndSignalExit = { signal: ProcessEndSignal; exitCode: number };

/** What the tools take from the operating system: where each tool lives, and how the app ends. */
export type ToolsPlatform = {
  installLocations: ToolInstallLocations;
  /** Homebrew's prefixes, Apple silicon's first, read as files by a probe that runs no `brew`. */
  homebrewPrefixPaths: AbsolutePath[];
  /** Each signal on which the app stops its tools and exits. */
  processEndSignals: ProcessEndSignalExit[];
};
