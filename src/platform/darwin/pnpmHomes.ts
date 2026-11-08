import type { CatalogLocation } from '../../catalog/catalog.js';
import { buildLocationBelow } from '../../environment/environmentLocation.js';
import { ASDF_INSTALLS_PATH_NAMES } from '../../explore/asdfVersions/asdfInstallsRoot.js';
import type { PnpmInstallPlaces } from '../../explore/explorePlatform.js';
import { MISE_INSTALLS_PATH_NAMES } from '../../explore/miseVersions/miseInstallsRoot.js';
import { NVM_NODE_VERSIONS_PATH_NAMES } from '../../explore/nvmVersions/nvmVersionsRoot.js';
import { PNPM_TOOL_NAME } from '../../explore/pnpmStores/pnpmToolName.js';
import { buildHomeLocation } from './buildHomeLocation.js';

const PNPM_STORE_FOLDER_NAME = 'store';

const ASDF_NODE_TOOL_NAME = 'nodejs';

const MISE_NODE_TOOL_NAME = 'node';

/** pnpm's home on macOS, `~/Library/pnpm`. */
const PNPM_HOME: CatalogLocation = { root: 'home', path: 'Library/pnpm' };

/** pnpm's home at the XDG data place, `~/.local/share/pnpm`. */
const PNPM_XDG_HOME: CatalogLocation = { root: 'home', path: '.local/share/pnpm' };

const PNPM_HOMES = [PNPM_HOME, PNPM_XDG_HOME];

/**
 * Where pnpm is installed on macOS beside Homebrew: its homes, corepack's cache in
 * `~/.cache/node/corepack`, the pnpm and the node versions of asdf, mise and nvm, the launcher
 * `pnpm` that `install.sh` and `pnpm setup` put in a home, and npm's globals in `lib/node_modules`
 * below each prefix.
 */
export const PNPM_INSTALL_PLACES: PnpmInstallPlaces = {
  homes: PNPM_HOMES,
  corepackRoots: [
    { root: 'home', path: '.cache/node/corepack/v1/pnpm' },
    { root: 'home', path: '.cache/node/corepack/pnpm' },
  ],
  pnpmVersionsRoots: [buildHomeLocation({ names: [...ASDF_INSTALLS_PATH_NAMES, PNPM_TOOL_NAME] })],
  miseInstallsRoots: [buildHomeLocation({ names: MISE_INSTALLS_PATH_NAMES })],
  launchers: PNPM_HOMES.map((home) => buildLocationBelow({ location: home, path: PNPM_TOOL_NAME })),
  npmPrefixes: [],
  npmGlobalFolderNames: ['lib', 'node_modules'],
  nodeVersionsRoots: [
    [...ASDF_INSTALLS_PATH_NAMES, ASDF_NODE_TOOL_NAME],
    [...MISE_INSTALLS_PATH_NAMES, MISE_NODE_TOOL_NAME],
    NVM_NODE_VERSIONS_PATH_NAMES,
  ].map((names) => ({ location: buildHomeLocation({ names: names }), prefixNames: [] })),
};

/** pnpm's store on macOS, `~/Library/pnpm/store`. */
export const PNPM_STORE_ROOT: CatalogLocation = buildLocationBelow({
  location: PNPM_HOME,
  path: PNPM_STORE_FOLDER_NAME,
});

/** pnpm's store at the XDG data place, `~/.local/share/pnpm/store`. */
export const PNPM_XDG_STORE_ROOT: CatalogLocation = buildLocationBelow({
  location: PNPM_XDG_HOME,
  path: PNPM_STORE_FOLDER_NAME,
});
