import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { Result } from '../result.js';
import type { ToolInstallLocations } from './toolInstallLocations.js';

/** A signal that ends the app, so every tool it still runs is stopped with it. */
export type ProcessEndSignal = 'SIGHUP' | 'SIGINT' | 'SIGQUIT' | 'SIGTERM';

/** A signal that ends the app on this platform, with the exit code it ends with. */
export type ProcessEndSignalExit = { signal: ProcessEndSignal; exitCode: number };

/** A tool's process, its standard input closed, its standard output and error piped. */
export type ToolProcess = ChildProcessByStdio<null, Readable, Readable>;

/** A started tool, with the means to end it together with every process it started. */
export type StartedTool = {
  process: ToolProcess;
  /** Ends the tool and every process it started; ones already gone are no error. */
  stop: () => void;
  /** Lets go of the hold on the tool's processes once its run settled, ending any left. */
  release: () => void;
};

/** How a tool's process starts and ends on this platform. */
export type ToolProcessPlatform = {
  /**
   * The environment every tool starts with, before the entries of its own: nothing inherited but
   * what the system needs to run a program, and a `PATH` of `toolFolderPath` and the system's
   * folders only.
   */
  buildBaseEnvironment: (params: {
    toolFolderPath: string;
    homeDir: string;
    tempDir: string;
  }) => Record<string, string>;
  /**
   * Starts the program at `path` in `cwd` so that `stop` reaches every process it starts. A
   * failure is the message of the start.
   */
  startTool: (params: {
    path: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
  }) => Result<StartedTool, string>;
};

/** What the tools take from the operating system: where each tool lives, and how the app ends. */
export type ToolsPlatform = {
  installLocations: ToolInstallLocations;
  /** Homebrew's prefixes, Apple silicon's first, read as files by a probe that runs no `brew`. */
  homebrewPrefixPaths: AbsolutePath[];
  /** Each signal on which the app stops its tools and exits. */
  processEndSignals: ProcessEndSignalExit[];
  processes: ToolProcessPlatform;
};
