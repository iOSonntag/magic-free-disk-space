const NVM_DIR_PATH_NAMES = ['.nvm'];

/** The folder of nvm's node versions below the home folder, `~/.nvm/versions/node`. */
export const NVM_NODE_VERSIONS_PATH_NAMES = [...NVM_DIR_PATH_NAMES, 'versions', 'node'];

/** The folder of nvm's alias files below the home folder, `~/.nvm/alias`. */
export const NVM_ALIAS_PATH_NAMES = [...NVM_DIR_PATH_NAMES, 'alias'];
