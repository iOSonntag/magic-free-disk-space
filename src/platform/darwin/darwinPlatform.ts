import type { Platform } from '../platform.js';
import { ANDROID_SDK_PATH_NAMES } from './androidSdkRoot.js';
import { CATALOG_ENTRIES } from './catalogEntries.js';
import { isEntryEvicted } from './hasDatalessFlag.js';
import { loadActiveXcodeBundlePath } from './loadActiveXcodeBundlePath.js';
import { DARWIN_HOMEBREW_PREFIX_PATHS, loadEnvironment } from './loadEnvironment.js';
import { DARWIN_PRIVACY_DENIAL_CODE, loadFullDiskAccess } from './loadFullDiskAccess.js';
import { loadInstalledApps } from './loadInstalledApps.js';
import { loadProcessCommands } from './loadProcessCommands.js';
import {
  PNPM_HOMES_PATH_NAMES,
  PNPM_STORE_ROOT_PATH_NAMES,
  PNPM_XDG_STORE_ROOT_PATH_NAMES,
} from './pnpmHomes.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from './projectSearchEvidence.js';
import { removeTree } from './removeTree.js';
import { PROJECT_SEARCH_EXCLUDED_NAMES, USER_FILE_ROOT_RELATIVE_PATHS } from './scanHomeFolders.js';
import { TOOL_INSTALL_LOCATIONS } from './toolInstallLocations.js';

/** Everything the app takes from macOS; the entry points hand each module its slice. */
export const darwinPlatform: Platform = {
  environment: { loadEnvironment: loadEnvironment },
  catalog: { entries: CATALOG_ENTRIES },
  tools: {
    installLocations: TOOL_INSTALL_LOCATIONS,
    homebrewPrefixPaths: DARWIN_HOMEBREW_PREFIX_PATHS,
    processEndSignals: [
      // 128 plus the number of SIGHUP, which a closed terminal sends.
      { signal: 'SIGHUP', exitCode: 129 },
      // 128 plus the number of the signal, as a shell reports a process that SIGINT ended.
      { signal: 'SIGINT', exitCode: 130 },
      // 128 plus the number of SIGQUIT.
      { signal: 'SIGQUIT', exitCode: 131 },
      // 128 plus the number of SIGTERM.
      { signal: 'SIGTERM', exitCode: 143 },
    ],
  },
  scan: {
    apps: { appSection: 'offerUnusedApps', loadInstalledApps: loadInstalledApps },
    loadActiveXcodeBundlePath: loadActiveXcodeBundlePath,
    projectSearchExcludedNames: PROJECT_SEARCH_EXCLUDED_NAMES,
    userFileRootRelativePaths: USER_FILE_ROOT_RELATIVE_PATHS,
  },
  delete: { removeTree: removeTree },
  explore: {
    pnpmHomes: PNPM_HOMES_PATH_NAMES,
    pnpmStoreRoot: PNPM_STORE_ROOT_PATH_NAMES,
    pnpmXdgStoreRoot: PNPM_XDG_STORE_ROOT_PATH_NAMES,
    androidSdkRoot: ANDROID_SDK_PATH_NAMES,
    projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
  },
  report: {
    computerPhrase: 'this Mac',
    systemName: 'macOS',
    trashName: 'Trash',
    updateInstallText:
      'Download the new version, quit this app, and move the new one into Applications in its place.',
  },
  system: {
    isEntryEvicted: isEntryEvicted,
    privacyDenialCode: DARWIN_PRIVACY_DENIAL_CODE,
    loadFullDiskAccess: loadFullDiskAccess,
    loadRunningProcesses: loadProcessCommands,
  },
};
