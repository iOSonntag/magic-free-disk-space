import type { CatalogLocation } from '../../catalog/catalog.js';
import type { PnpmInstallPlaces } from '../../explore/explorePlatform.js';

/** pnpm's homes: `~/Library/pnpm` and the XDG `~/.local/share/pnpm`. */
const PNPM_HOMES: CatalogLocation[] = [
  { root: 'home', path: 'Library/pnpm' },
  { root: 'home', path: '.local/share/pnpm' },
];

/**
 * Where pnpm is installed on macOS beside asdf, mise, nvm and Homebrew: its homes, corepack's
 * cache in `~/.cache/node/corepack`, the launcher `pnpm` that `install.sh` and `pnpm setup` put in
 * a home, and npm's globals in `lib/node_modules` below each prefix.
 */
export const PNPM_INSTALL_PLACES: PnpmInstallPlaces = {
  homes: PNPM_HOMES,
  corepackRoots: [
    { root: 'home', path: '.cache/node/corepack/v1/pnpm' },
    { root: 'home', path: '.cache/node/corepack/pnpm' },
  ],
  launchers: PNPM_HOMES.map((home) => ({ root: home.root, path: `${home.path}/pnpm` })),
  npmPrefixes: [],
  npmGlobalFolderNames: ['lib', 'node_modules'],
};

/** pnpm's store on macOS, `~/Library/pnpm/store`. */
export const PNPM_STORE_ROOT: CatalogLocation = { root: 'home', path: 'Library/pnpm/store' };

/** pnpm's store at the XDG data place, `~/.local/share/pnpm/store`. */
export const PNPM_XDG_STORE_ROOT: CatalogLocation = {
  root: 'home',
  path: '.local/share/pnpm/store',
};
