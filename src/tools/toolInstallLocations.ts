/** One name per binary the explore probes run; each Homebrew prefix is a tool of its own. */
export type ToolName =
  | 'xcrun'
  | 'dart'
  | 'mise'
  | 'brewAppleSilicon'
  | 'brewIntel'
  | 'avdmanager'
  | 'asdf';

/** A fixed place of the binary; `home` paths are relative to the home folder. */
export type ToolLocationPath = { kind: 'path'; root: 'home' | 'absolute'; path: string };

/**
 * The Dart binary of each Flutter SDK that a project of `~/.pub-cache/active_roots` names as
 * its `flutterRoot`, never Flutter's own `bin/dart` wrapper, which can download.
 */
export type ToolLocationFlutterSdkFromActiveRoots = { kind: 'flutterSdkFromActiveRoots' };

export type ToolLocation = ToolLocationPath | ToolLocationFlutterSdkFromActiveRoots;

export type ToolInstallLocations = Record<ToolName, ToolLocation[]>;

/** Where each tool is looked for, in order; `PATH` is never read. */
export const TOOL_INSTALL_LOCATIONS: ToolInstallLocations = {
  xcrun: [{ kind: 'path', root: 'absolute', path: '/usr/bin/xcrun' }],
  dart: [
    { kind: 'flutterSdkFromActiveRoots' },
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/dart' },
    { kind: 'path', root: 'absolute', path: '/usr/local/bin/dart' },
    { kind: 'path', root: 'home', path: 'fvm/default/bin/cache/dart-sdk/bin/dart' },
  ],
  mise: [
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/mise' },
    { kind: 'path', root: 'absolute', path: '/usr/local/bin/mise' },
    { kind: 'path', root: 'home', path: '.local/bin/mise' },
  ],
  brewAppleSilicon: [{ kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/brew' }],
  brewIntel: [{ kind: 'path', root: 'absolute', path: '/usr/local/bin/brew' }],
  avdmanager: [
    { kind: 'path', root: 'home', path: 'Library/Android/sdk/cmdline-tools/latest/bin/avdmanager' },
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/avdmanager' },
  ],
  asdf: [
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/asdf' },
    { kind: 'path', root: 'absolute', path: '/usr/local/bin/asdf' },
    { kind: 'path', root: 'home', path: '.asdf/bin/asdf' },
  ],
};
