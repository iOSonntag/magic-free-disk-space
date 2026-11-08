import type { CatalogLocation } from '../../../catalog/catalog.js';
import type { PnpmInstallPlaces } from '../../../explore/explorePlatform.js';

/** pnpm's home on Windows, `%LOCALAPPDATA%\pnpm`. */
const PNPM_HOME: CatalogLocation = { root: 'localAppData', path: 'pnpm' };

/**
 * Where pnpm is installed on Windows, each place at the default of its tool: pnpm's home,
 * corepack's cache, the pnpm that Volta, Scoop and winget install, mise's installs, npm's prefixes
 * of the official installer, of Scoop and of Volta's packages, and the node versions of
 * nvm-windows, fnm, Volta and mise. npm installs a global package in `<prefix>\node_modules` on Windows, with no `lib`.
 */
export const PNPM_INSTALL_PLACES: PnpmInstallPlaces = {
  homes: [PNPM_HOME],
  corepackRoots: [
    { root: 'localAppData', path: 'node/corepack/v1/pnpm' },
    { root: 'localAppData', path: 'node/corepack/pnpm' },
  ],
  pnpmVersionsRoots: [
    // `volta install pnpm` unpacks each version with its `package.json` at the version's folder.
    { root: 'localAppData', path: 'Volta/tools/image/pnpm' },
    // Scoop keeps each version's folder until `scoop cleanup`, and the junction `current`.
    { root: 'home', path: 'scoop/apps/pnpm' },
  ],
  miseInstallsRoots: [{ root: 'localAppData', path: 'mise/installs' }],
  // The standalone executable. The `pnpm.cmd` and `pnpm.ps1` shims beside it run the pnpm of
  // `.tools` or `global`, which the probe reads on its own, as it does a `#!` launcher.
  launchers: [
    buildPnpmHomeEntry({ path: 'pnpm.exe' }),
    buildPnpmHomeEntry({ path: 'bin/pnpm.exe' }),
    // winget installs a portable package in a folder of its own and hard-links the command beside it.
    {
      root: 'localAppData',
      path: 'Microsoft/WinGet/Packages/pnpm.pnpm_Microsoft.Winget.Source_8wekyb3d8bbwe/pnpm.exe',
    },
  ],
  npmPrefixes: [
    { root: 'roamingAppData', path: 'npm' },
    // Scoop's node sets npm's prefix to its persisted `bin`, which outlives each version.
    { root: 'home', path: 'scoop/persist/nodejs/bin' },
    { root: 'home', path: 'scoop/persist/nodejs-lts/bin' },
    // Volta installs each global package below a prefix of its own.
    { root: 'localAppData', path: 'Volta/tools/image/packages/pnpm' },
    { root: 'localAppData', path: 'Volta/tools/image/packages/@pnpm/exe' },
  ],
  npmGlobalFolderNames: ['node_modules'],
  nodeVersionsRoots: [
    // nvm-windows 2, then 1.2, then the releases before 1.2.
    { location: { root: 'localAppData', path: 'Author Software/nvm/installs' }, prefixNames: [] },
    { location: { root: 'localAppData', path: 'nvm' }, prefixNames: [] },
    { location: { root: 'roamingAppData', path: 'nvm' }, prefixNames: [] },
    // fnm, then its legacy folder, which it keeps using where it exists.
    {
      location: { root: 'roamingAppData', path: 'fnm/node-versions' },
      prefixNames: ['installation'],
    },
    { location: { root: 'home', path: '.fnm/node-versions' }, prefixNames: ['installation'] },
    { location: { root: 'localAppData', path: 'Volta/tools/image/node' }, prefixNames: [] },
    { location: { root: 'localAppData', path: 'mise/installs/node' }, prefixNames: [] },
  ],
};

/** pnpm's store on Windows, `%LOCALAPPDATA%\pnpm\store`. */
export const PNPM_STORE_ROOT: CatalogLocation = buildPnpmHomeEntry({ path: 'store' });

/** The place at `path` below pnpm's home, its names joined by `/`. */
function buildPnpmHomeEntry(params: { path: string }): CatalogLocation {
  return { root: PNPM_HOME.root, path: `${PNPM_HOME.path}/${params.path}` };
}
