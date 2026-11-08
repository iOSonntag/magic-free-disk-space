import type { Platform } from '../platform.js';
import { WIN32_CATALOG } from './catalog/win32Catalog.js';
import { win32EntryReads } from './entryReads.js';
import { loadAdvisedApps, uninstallKeySources } from './loadAdvisedApps.js';
import { loadEnvironment } from './loadEnvironment.js';
import { loadRunningProcesses } from './loadRunningProcesses.js';
import { loadSystemVersion } from './loadSystemVersion.js';
import { loadVolumeSpace } from './loadVolumeSpace.js';
import { loadFullDiskAccess, WIN32_PRIVACY_DENIAL_CODE } from './readRules.js';
import { removeTree } from './removeTree.js';
import { win32ReportTexts } from './reportTexts.js';
import { win32ToolProcesses } from './toolProcesses.js';
import { emptyRecycleBin, loadRecycleBinContent } from './win32Api.js';

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
    processes: win32ToolProcesses,
  },
  scan: {
    apps: {
      appSection: 'adviseOnly',
      loadAdvisedApps: () => loadAdvisedApps({ sources: uninstallKeySources }),
      installedAppsPageName: 'Settings > Apps',
    },
    // A system app is a bundle macOS keeps outside its app folders.
    systemApps: [],
    trash: {
      kind: 'recycleBins',
      title: win32ReportTexts.trashName,
      explanation:
        'Files you deleted on this drive; emptying the Recycle Bin removes all of them at once, as Windows does.',
      regeneration: 'A deleted file does not come back.',
      risk: 'careful',
      binFolderName: '$Recycle.Bin',
      loadRecycleBin: loadRecycleBinContent,
    },
    cloudOnlyEntries: { kind: 'counted', cloudStoreName: 'OneDrive' },
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
      loadRecycleBin: loadRecycleBinContent,
      emptyRecycleBin: emptyRecycleBin,
      nothingToEmptyCode: E_UNEXPECTED_HRESULT,
    },
  },
  explore: WIN32_CATALOG.explore,
  report: win32ReportTexts,
  system: {
    entryReads: win32EntryReads,
    privacyDenialCode: WIN32_PRIVACY_DENIAL_CODE,
    loadFullDiskAccess: loadFullDiskAccess,
    loadRunningProcesses: loadRunningProcesses,
    loadVolumeSpace: loadVolumeSpace,
    loadSystemVersion: loadSystemVersion,
  },
};
