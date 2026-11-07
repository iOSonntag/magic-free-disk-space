import type { ToolInstallLocations } from '../../tools/toolInstallLocations.js';

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
  brctl: [{ kind: 'path', root: 'absolute', path: '/usr/bin/brctl' }],
  vagrant: [
    { kind: 'path', root: 'absolute', path: '/opt/vagrant/bin/vagrant' },
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/vagrant' },
    { kind: 'path', root: 'absolute', path: '/usr/local/bin/vagrant' },
  ],
  rustup: [
    { kind: 'path', root: 'home', path: '.cargo/bin/rustup' },
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/rustup' },
    // Homebrew's rustup is keg-only, so it links nothing into `bin`.
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/opt/rustup/bin/rustup' },
    { kind: 'path', root: 'absolute', path: '/usr/local/opt/rustup/bin/rustup' },
  ],
  conda: [
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/conda' },
    { kind: 'path', root: 'home', path: 'miniconda3/bin/conda' },
    { kind: 'path', root: 'home', path: 'miniforge3/bin/conda' },
    { kind: 'path', root: 'home', path: 'anaconda3/bin/conda' },
  ],
  fvm: [
    { kind: 'path', root: 'absolute', path: '/opt/homebrew/bin/fvm' },
    { kind: 'path', root: 'home', path: '.pub-cache/bin/fvm' },
  ],
};
