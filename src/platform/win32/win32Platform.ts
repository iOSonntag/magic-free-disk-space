import type { Platform } from '../platform.js';
import { WIN32_CATALOG } from './catalog/win32Catalog.js';
import { loadAdvisedApps, UNINSTALL_KEY_SOURCES } from './loadAdvisedApps.js';
import { loadEntryPlacement } from './loadEntryPlacement.js';
import { loadEnvironment } from './loadEnvironment.js';
import { loadPrivateBytes } from './loadPrivateBytes.js';
import { loadRunningProcesses } from './loadRunningProcesses.js';
import { loadSystemVersion } from './loadSystemVersion.js';
import { loadVolumeSpace } from './loadVolumeSpace.js';
import { loadFullDiskAccess, WIN32_PRIVACY_DENIAL_CODE } from './readRules.js';
import { removeTree } from './removeTree.js';
import { WIN32_REPORT_TEXTS } from './reportTexts.js';
import { WIN32_TOOL_PROCESSES } from './toolProcesses.js';
import { emptyRecycleBin, loadRecycleBinCount } from './win32Api.js';

/** `E_UNEXPECTED`, what `SHEmptyRecycleBinW` answers for a bin that holds nothing to empty. */
const E_UNEXPECTED_HRESULT = 0x8000ffff;

/** Everything the app takes from Windows; the entry points hand each module its slice. */
export const win32Platform: Platform = {
  environment: { loadEnvironment: loadEnvironment },
  catalog: { entries: WIN32_CATALOG.entries },
  tools: {
    // No tool is trusted on Windows: its owner check reads no POSIX owner, so every probe that
    // runs one falls back to its advice.
    installLocations: {
      xcrun: [],
      dart: [],
      mise: [],
      brewAppleSilicon: [],
      brewIntel: [],
      avdmanager: [],
      asdf: [],
      brctl: [],
      vagrant: [],
      rustup: [],
      conda: [],
      fvm: [],
    },
    homebrewPrefixPaths: [],
    // Windows has neither SIGHUP nor SIGQUIT; Ctrl+C is SIGINT. 128 plus the number of each.
    processEndSignals: [
      { signal: 'SIGINT', exitCode: 130 },
      { signal: 'SIGTERM', exitCode: 143 },
    ],
    processes: WIN32_TOOL_PROCESSES,
  },
  scan: {
    apps: {
      appSection: 'adviseOnly',
      loadAdvisedApps: () => loadAdvisedApps({ sources: UNINSTALL_KEY_SOURCES }),
      installedAppsPageName: 'Settings > Apps',
    },
    // A system app is a bundle macOS keeps outside its app folders.
    systemApps: [],
    trash: {
      kind: 'recycleBins',
      title: WIN32_REPORT_TEXTS.trashName,
      explanation:
        'Files you deleted on this drive; emptying the Recycle Bin removes all of them at once, as Windows does.',
      regeneration: 'A deleted file does not come back.',
      risk: 'careful',
      binFolderName: '$Recycle.Bin',
      loadRecycleBin: loadRecycleBinCount,
    },
    // Xcode exists only on macOS.
    loadActiveXcodeBundlePath: async () => ({ kind: 'succeeded', value: null }),
    projectSearchExcludedNames: WIN32_CATALOG.projectSearchExcludedNames,
    projectArtifactRules: WIN32_CATALOG.projectArtifactRules,
    userFileRoots: WIN32_CATALOG.userFileRoots,
  },
  delete: {
    removeTree: removeTree,
    trash: {
      kind: 'recycleBins',
      loadRecycleBin: loadRecycleBinCount,
      emptyRecycleBin: emptyRecycleBin,
      nothingToEmptyCode: E_UNEXPECTED_HRESULT,
    },
  },
  explore: WIN32_CATALOG.explore,
  report: WIN32_REPORT_TEXTS,
  system: {
    entryReads: { loadEntryPlacement: loadEntryPlacement, loadPrivateBytes: loadPrivateBytes },
    privacyDenialCode: WIN32_PRIVACY_DENIAL_CODE,
    loadFullDiskAccess: loadFullDiskAccess,
    loadRunningProcesses: loadRunningProcesses,
    loadVolumeSpace: loadVolumeSpace,
    loadSystemVersion: loadSystemVersion,
  },
};
