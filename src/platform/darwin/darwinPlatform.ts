import { PROJECT_ARTIFACT_RULES } from '../../catalog/projectArtifactRules.js';
import type { Platform } from '../platform.js';
import { androidSdkRoot, FLUTTER_SETTINGS_PATHS } from './androidSdkRoot.js';
import { downloadsRoot, icloudDriveRoot, mailDownloadsRoot } from './appleDataRoots.js';
import { BROWSER_BUNDLES } from './browserBundles.js';
import { CATALOG_ENTRIES } from './catalogEntries.js';
import { CONTAINER_ENGINES } from './containerEngines.js';
import { IDE_VERSION_ROOTS } from './ideVersionRoots.js';
import { loadActiveXcodeBundlePath } from './loadActiveXcodeBundlePath.js';
import { loadEntryPlacement } from './loadEntryPlacement.js';
import { DARWIN_HOMEBREW_PREFIX_PATHS, loadEnvironment } from './loadEnvironment.js';
import { DARWIN_PRIVACY_DENIAL_CODE, loadFullDiskAccess } from './loadFullDiskAccess.js';
import { loadInstalledApps } from './loadInstalledApps.js';
import { loadPrivateBytes } from './loadPrivateSize.js';
import { loadProcessCommands } from './loadProcessCommands.js';
import { loadSystemVersion } from './loadSystemVersion.js';
import { loadVolumeSpace } from './loadVolumeSpace.js';
import { ORPHAN_LOCATIONS } from './orphanLocations.js';
import { pnpmInstallPlaces, pnpmStoreRoot, pnpmXdgStoreRoot } from './pnpmHomes.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from './projectSearchEvidence.js';
import { removeTree } from './removeTree.js';
import { PROJECT_SEARCH_EXCLUDED_NAMES, userFileRoots } from './scanHomeFolders.js';
import { DARWIN_SYSTEM_APPS, MAIL_BUNDLE_PATHS } from './systemApps.js';
import { TOOL_INSTALL_LOCATIONS } from './toolInstallLocations.js';
import { darwinToolProcesses } from './toolProcesses.js';
import { vscodeProfilesRoot } from './vscodeProfilesRoot.js';

const XCODE_BUNDLE_ID_PREFIX = 'com.apple.dt.Xcode';

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
    processes: darwinToolProcesses,
  },
  scan: {
    apps: {
      appSection: 'offerUnusedApps',
      loadInstalledApps: loadInstalledApps,
      orphanLocations: ORPHAN_LOCATIONS,
      xcodeBundleIdPrefix: XCODE_BUNDLE_ID_PREFIX,
    },
    systemApps: DARWIN_SYSTEM_APPS,
    // The Trash is the catalog's entry `.Trash`.
    trash: { kind: 'catalogFolder' },
    cloudOnlyEntries: { kind: 'notCounted' },
    loadActiveXcodeBundlePath: loadActiveXcodeBundlePath,
    projectSearchExcludedNames: PROJECT_SEARCH_EXCLUDED_NAMES,
    projectArtifactRules: PROJECT_ARTIFACT_RULES,
    userFileRoots: userFileRoots,
    // Launch Services shows many folders named with an extension as one document.
    userFilePackageFolders: 'extensionNamed',
  },
  delete: { removeTree: removeTree, trash: { kind: 'catalogFolder' } },
  explore: {
    pnpmInstallPlaces: pnpmInstallPlaces,
    pnpmStoreRoot: pnpmStoreRoot,
    pnpmXdgStoreRoot: pnpmXdgStoreRoot,
    androidSdkRoot: androidSdkRoot,
    flutterSettingsPaths: FLUTTER_SETTINGS_PATHS,
    vscodeProfilesRoot: vscodeProfilesRoot,
    projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
    containerEngines: CONTAINER_ENGINES,
    ideVersionRoots: IDE_VERSION_ROOTS,
    icloudDriveRoot: icloudDriveRoot,
    mailDownloadsRoot: mailDownloadsRoot,
    mailBundlePaths: MAIL_BUNDLE_PATHS,
    downloadsRoot: downloadsRoot,
    browserBundles: BROWSER_BUNDLES,
  },
  report: {
    computerPhrase: 'this Mac',
    systemName: 'macOS',
    trashName: 'Trash',
    updateInstallText:
      'Download the new version, quit this app, and move the new one into Applications in its place.',
  },
  system: {
    entryReads: { loadEntryPlacement: loadEntryPlacement, loadPrivateBytes: loadPrivateBytes },
    privacyDenialCode: DARWIN_PRIVACY_DENIAL_CODE,
    loadFullDiskAccess: loadFullDiskAccess,
    loadRunningProcesses: loadProcessCommands,
    loadVolumeSpace: loadVolumeSpace,
    loadSystemVersion: loadSystemVersion,
  },
};
