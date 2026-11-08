import type { CatalogLocation } from '../../../catalog/catalog.js';
import { buildLocationBelow } from '../../../environment/environmentLocation.js';
import type { PnpmInstallPlaces } from '../../../explore/explorePlatform.js';

/** pnpm's home on Windows, `%LOCALAPPDATA%\pnpm`. */
const pnpmHome: CatalogLocation = { root: 'localAppData', path: 'pnpm' };

const voltaImage: CatalogLocation = { root: 'localAppData', path: 'Volta/tools/image' };

const miseInstalls: CatalogLocation = { root: 'localAppData', path: 'mise/installs' };

const scoopHome: CatalogLocation = { root: 'home', path: 'scoop' };

/**
 * Where pnpm is installed on Windows, at each tool's default: pnpm's home, corepack's cache, pnpm
 * of Volta, Scoop and winget, mise's installs, npm prefixes of the official installer, Scoop and
 * Volta, and node versions of nvm-windows, fnm, Volta and mise.
 */
export const pnpmInstallPlaces: PnpmInstallPlaces = {
  homes: [pnpmHome],
  corepackRoots: [
    { root: 'localAppData', path: 'node/corepack/v1/pnpm' },
    { root: 'localAppData', path: 'node/corepack/pnpm' },
  ],
  pnpmVersionsRoots: [
    // `volta install pnpm` unpacks each version with its `package.json` at the version's folder.
    buildLocationBelow({ location: voltaImage, path: 'pnpm' }),
    // Scoop keeps each version's folder until `scoop cleanup`, and the junction `current`.
    buildLocationBelow({ location: scoopHome, path: 'apps/pnpm' }),
  ],
  miseInstallsRoots: [miseInstalls],
  // The standalone executable. The `pnpm.cmd` and `pnpm.ps1` shims beside it run the pnpm of
  // `.tools` or `global`, which the probe reads on its own, as it does a `#!` launcher.
  launchers: [
    buildLocationBelow({ location: pnpmHome, path: 'pnpm.exe' }),
    buildLocationBelow({ location: pnpmHome, path: 'bin/pnpm.exe' }),
    // winget installs a portable package in a folder of its own and hard-links the command
    // beside it.
    {
      root: 'localAppData',
      path: 'Microsoft/WinGet/Packages/pnpm.pnpm_Microsoft.Winget.Source_8wekyb3d8bbwe/pnpm.exe',
    },
  ],
  npmPrefixes: [
    { root: 'roamingAppData', path: 'npm' },
    // Scoop's node sets npm's prefix to its persisted `bin`, which outlives each version.
    buildLocationBelow({ location: scoopHome, path: 'persist/nodejs/bin' }),
    buildLocationBelow({ location: scoopHome, path: 'persist/nodejs-lts/bin' }),
    // Volta installs each global package below a prefix of its own.
    buildLocationBelow({ location: voltaImage, path: 'packages/pnpm' }),
    buildLocationBelow({ location: voltaImage, path: 'packages/@pnpm/exe' }),
  ],
  // npm installs a global package in `<prefix>\node_modules` on Windows, with no `lib`.
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
    { location: buildLocationBelow({ location: voltaImage, path: 'node' }), prefixNames: [] },
    { location: buildLocationBelow({ location: miseInstalls, path: 'node' }), prefixNames: [] },
  ],
};

/** pnpm's store on Windows, `%LOCALAPPDATA%\pnpm\store`. */
export const pnpmStoreRoot: CatalogLocation = buildLocationBelow({
  location: pnpmHome,
  path: 'store',
});
