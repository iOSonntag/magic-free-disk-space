import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { DeletePlatformTrashRecycleBins } from '../../src/delete/deletePlatform.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { Platform } from '../../src/platform/platform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { Result } from '../../src/result.js';
import type { RecycleBinContent } from '../../src/scan/candidate.js';
import type { ScanIssue } from '../../src/scan/issue.js';
import type {
  AdvisedApp,
  RecycleBinLoad,
  ScanPlatformAppsAdvised,
  ScanPlatformTrashRecycleBins,
} from '../../src/scan/scanPlatform.js';
import type { SystemCallFailure } from '../../src/system/systemCallFailure.js';
import type { RunningProcessesLoad } from '../../src/system/systemPlatform.js';
import type { ToolInstallLocations } from '../../src/tools/toolInstallLocations.js';

/** `E_FAIL`, the HRESULT of a call that failed for no reason it names. */
const E_FAIL_HRESULT = 0x80004005;

/**
 * The Windows platform for a test, over the real sections of `win32Platform` with what a test
 * answers itself swapped in. Left out, no installed app is listed, every Recycle Bin holds nothing
 * and fails to empty as `E_FAIL` would, and the processes are the real ones, so no test reads the
 * registry or touches a real bin.
 */
export function buildTestWin32Platform(params: {
  loadAdvisedApps?: ScanPlatformAppsAdvised['loadAdvisedApps'];
  loadRecycleBin?: RecycleBinLoad;
  emptyRecycleBin?: DeletePlatformTrashRecycleBins['emptyRecycleBin'];
  loadRunningProcesses?: RunningProcessesLoad;
}): Platform {
  const loadRecycleBin = params.loadRecycleBin ?? loadEmptyRecycleBin;

  return {
    ...win32Platform,
    scan: {
      ...win32Platform.scan,
      apps: {
        ...getWin32AdvisedAppsSection(),
        loadAdvisedApps: params.loadAdvisedApps ?? loadNoAdvisedApps,
      },
      trash: { ...getWin32RecycleBinScanTrash(), loadRecycleBin: loadRecycleBin },
    },
    delete: {
      ...win32Platform.delete,
      trash: {
        ...getWin32RecycleBinDeleteTrash(),
        loadRecycleBin: loadRecycleBin,
        emptyRecycleBin: params.emptyRecycleBin ?? failToEmptyRecycleBin,
      },
    },
    system: {
      ...win32Platform.system,
      loadRunningProcesses:
        params.loadRunningProcesses ?? win32Platform.system.loadRunningProcesses,
    },
  };
}

/** The platform of the host that runs the tests, with what a test must never touch faked. */
export const hostPlatform: Platform =
  process.platform === 'win32' ? buildTestWin32Platform({}) : darwinPlatform;

/**
 * The host's platform of a run on the fixture root: the test's catalog and tools, and no Homebrew
 * prefix, so no test reads the real ones. On macOS the apps come from the app folder of the
 * fixture environment.
 */
export function buildTestPlatform(params: {
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
}): Platform {
  return {
    ...hostPlatform,
    catalog: { ...hostPlatform.catalog, entries: params.catalogEntries },
    tools: {
      ...hostPlatform.tools,
      installLocations: params.toolInstallLocations,
      homebrewPrefixPaths: [],
    },
  };
}

/** The Recycle Bins as the scan of Windows measures them; throws if Windows ever measures its trash otherwise. */
export function getWin32RecycleBinScanTrash(): ScanPlatformTrashRecycleBins {
  const trash = win32Platform.scan.trash;

  if (trash.kind !== 'recycleBins') {
    throw new Error('The scan of Windows measures a Recycle Bin per drive.');
  }

  return trash;
}

function getWin32RecycleBinDeleteTrash(): DeletePlatformTrashRecycleBins {
  const trash = win32Platform.delete.trash;

  if (trash.kind !== 'recycleBins') {
    throw new Error('The deletion of Windows empties a Recycle Bin per drive.');
  }

  return trash;
}

function getWin32AdvisedAppsSection(): ScanPlatformAppsAdvised {
  const apps = win32Platform.scan.apps;

  if (apps.appSection !== 'adviseOnly') {
    throw new Error('The scan of Windows only advises on the installed apps.');
  }

  return apps;
}

async function loadNoAdvisedApps(): Promise<{ apps: AdvisedApp[]; issues: ScanIssue[] }> {
  return { apps: [], issues: [] };
}

function loadEmptyRecycleBin(): Result<RecycleBinContent, SystemCallFailure> {
  return { kind: 'succeeded', value: { sizeBytes: 0, itemCount: 0 } };
}

/** Empties nothing and fails as `E_FAIL` would, since a test never empties a Recycle Bin. */
function failToEmptyRecycleBin(): Result<null, SystemCallFailure> {
  return { kind: 'failed', failure: { call: 'SHEmptyRecycleBinW', code: E_FAIL_HRESULT } };
}
