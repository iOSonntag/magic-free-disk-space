const PNPM_HOME_PATH_NAMES = ['Library', 'pnpm'];

const PNPM_XDG_HOME_PATH_NAMES = ['.local', 'share', 'pnpm'];

const PNPM_STORE_FOLDER_NAME = 'store';

/** pnpm's homes below the home folder: `~/Library/pnpm` and the XDG `~/.local/share/pnpm`. */
export const PNPM_HOMES_PATH_NAMES = [PNPM_HOME_PATH_NAMES, PNPM_XDG_HOME_PATH_NAMES];

/** pnpm's store below the home folder on macOS, `~/Library/pnpm/store`. */
export const PNPM_STORE_ROOT_PATH_NAMES = [...PNPM_HOME_PATH_NAMES, PNPM_STORE_FOLDER_NAME];

/** pnpm's store below the home folder at the XDG data place, `~/.local/share/pnpm/store`. */
export const PNPM_XDG_STORE_ROOT_PATH_NAMES = [...PNPM_XDG_HOME_PATH_NAMES, PNPM_STORE_FOLDER_NAME];
