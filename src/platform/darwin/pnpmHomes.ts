import type { CatalogLocation } from '../../catalog/catalog.js';

/** pnpm's homes: `~/Library/pnpm` and the XDG `~/.local/share/pnpm`. */
export const PNPM_HOMES: CatalogLocation[] = [
  { root: 'home', path: 'Library/pnpm' },
  { root: 'home', path: '.local/share/pnpm' },
];

/** pnpm's store on macOS, `~/Library/pnpm/store`. */
export const PNPM_STORE_ROOT: CatalogLocation = { root: 'home', path: 'Library/pnpm/store' };

/** pnpm's store at the XDG data place, `~/.local/share/pnpm/store`. */
export const PNPM_XDG_STORE_ROOT: CatalogLocation = {
  root: 'home',
  path: '.local/share/pnpm/store',
};
