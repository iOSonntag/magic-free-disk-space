/** One name per binary the explore probes run; each Homebrew prefix is a tool of its own. */
export type ToolName =
  | 'xcrun'
  | 'dart'
  | 'mise'
  | 'brewAppleSilicon'
  | 'brewIntel'
  | 'avdmanager'
  | 'asdf'
  | 'brctl'
  | 'vagrant'
  | 'rustup'
  | 'conda'
  | 'fvm';

/** A fixed place of the binary; `home` paths are relative to the home folder. */
export type ToolLocationPath = { kind: 'path'; root: 'home' | 'absolute'; path: string };

/**
 * The Dart binary of each Flutter SDK that a project of `~/.pub-cache/active_roots` names as
 * its `flutterRoot`, never Flutter's own `bin/dart` wrapper, which can download.
 */
export type ToolLocationFlutterSdkFromActiveRoots = { kind: 'flutterSdkFromActiveRoots' };

export type ToolLocation = ToolLocationPath | ToolLocationFlutterSdkFromActiveRoots;

/** Where each tool is looked for, in order; `PATH` is never read. */
export type ToolInstallLocations = Record<ToolName, ToolLocation[]>;
