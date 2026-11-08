import { toComparablePathText } from '../../path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../path/pathRules.js';
import type { ScanIssue } from '../../scan/issue.js';
import type { AdvisedApp } from '../../scan/scanPlatform.js';
import { formatSystemCallFailure } from '../../system/systemCallFailure.js';
import type {
  RegistryHive,
  RegistryView,
  UninstallKeyValues,
  Win32CallFailure,
} from './win32Api.js';
import { loadUninstallKeyValues } from './win32Api.js';

/** One key whose subkeys each describe an installed app, in one view of the registry. */
type UninstallKeySource = { hive: RegistryHive; view: RegistryView; keyPath: string };

const UNINSTALL_KEY_PATH = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

/**
 * The keys Settings > Apps lists the apps of: the user's own, which has one view, and the
 * machine's in its 64-bit and its 32-bit view. The 32-bit view is how the machine's key reads
 * the apps of 32 bits, so `Wow6432Node` is never opened by its name.
 */
export const uninstallKeySources: UninstallKeySource[] = [
  { hive: 'currentUser', view: 'shared', keyPath: UNINSTALL_KEY_PATH },
  { hive: 'localMachine', view: 'bits64', keyPath: UNINSTALL_KEY_PATH },
  { hive: 'localMachine', view: 'bits32', keyPath: UNINSTALL_KEY_PATH },
];

/** The `ReleaseType` values of an update of another app, which Settings > Apps does not list. */
const updateReleaseTypes = ['Update', 'Hotfix', 'Security Update'];

/** `EstimatedSize` counts kilobytes. */
const ESTIMATED_SIZE_UNIT_BYTES = 1024;

const hiveNames: Record<RegistryHive, string> = {
  currentUser: 'HKEY_CURRENT_USER',
  localMachine: 'HKEY_LOCAL_MACHINE',
};

/**
 * The apps the Uninstall keys of `sources` list as the user can uninstall them, each once. A key
 * that cannot be read is an issue, and the others are read on. Never throws.
 */
export async function loadAdvisedApps(params: {
  sources: UninstallKeySource[];
}): Promise<{ apps: AdvisedApp[]; issues: ScanIssue[] }> {
  const keyValues: UninstallKeyValues[] = [];
  const issues: ScanIssue[] = [];

  for (const source of params.sources) {
    const values = loadUninstallKeyValues({
      hive: source.hive,
      view: source.view,
      keyPath: source.keyPath,
    });

    if (values.kind === 'failed') {
      issues.push(buildUninstallKeyIssue({ source: source, failure: values.failure }));

      continue;
    }

    keyValues.push(...values.value);
  }

  return { apps: decideUninstallApps({ keyValues: keyValues }), issues: issues };
}

/** The issue of a key that could not be read, at the key's full path, with the call that failed. */
export function buildUninstallKeyIssue(params: {
  source: UninstallKeySource;
  failure: Win32CallFailure;
}): ScanIssue {
  return {
    path: `${hiveNames[params.source.hive]}\\${params.source.keyPath}`,
    reason: 'unexpected',
    detail: formatSystemCallFailure({ failure: params.failure }),
  };
}

/**
 * The subkeys Settings > Apps shows as apps: each with a display name and an uninstall command,
 * that is no system component, no part of another app, and no update. An app listed in two views
 * or hives by the same name and install folder is listed once, with the first size any gives.
 */
export function decideUninstallApps(params: { keyValues: UninstallKeyValues[] }): AdvisedApp[] {
  const appsByIdentity = new Map<string, AdvisedApp>();

  for (const values of params.keyValues) {
    const app = toAdvisedApp({ values: values });

    if (app === null) {
      continue;
    }

    const identity = [app.displayName, app.installFolderPath ?? '']
      .map((text) => toComparablePathText({ rules: WIN32_PATH_RULES, text: text }))
      .join('\n');
    const listed = appsByIdentity.get(identity);

    if (listed === undefined) {
      appsByIdentity.set(identity, app);
    } else if (listed.estimatedBytes === null) {
      appsByIdentity.set(identity, { ...listed, estimatedBytes: app.estimatedBytes });
    }
  }

  return [...appsByIdentity.values()];
}

function toAdvisedApp(params: { values: UninstallKeyValues }): AdvisedApp | null {
  const displayName = params.values.displayName?.trim() ?? '';
  const uninstallString = params.values.uninstallString?.trim() ?? '';

  if (displayName === '' || uninstallString === '') {
    return null;
  }

  if (params.values.systemComponent === 1) {
    return null;
  }

  if ((params.values.parentKeyName?.trim() ?? '') !== '') {
    return null;
  }

  if (
    params.values.releaseType !== null &&
    updateReleaseTypes.includes(params.values.releaseType)
  ) {
    return null;
  }

  return {
    displayName: displayName,
    installFolderPath: parseInstallFolderPath({ text: params.values.installLocation }),
    estimatedBytes: toEstimatedBytes({ estimatedSize: params.values.estimatedSize }),
  };
}

/**
 * The install folder without the quotes or the trailing backslash installers write around it, a
 * drive root with its backslash; `null` for none, and for a text that is no absolute Windows path.
 */
function parseInstallFolderPath(params: { text: string | null }): AbsolutePath | null {
  const unquoted = (params.text ?? '').trim().replace(/^"(.*)"$/, '$1');
  const folderPath = parseAbsolutePath({
    rules: WIN32_PATH_RULES,
    text: unquoted.replace(/[\\/]+$/, ''),
  });

  if (folderPath.kind === 'succeeded') {
    return folderPath.value;
  }

  // A drive root, which is no absolute path without its backslash.
  const driveRootPath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: unquoted });

  return driveRootPath.kind === 'succeeded' ? driveRootPath.value : null;
}

/** A size of 0 is an installer that wrote none. */
function toEstimatedBytes(params: { estimatedSize: number | null }): number | null {
  if (params.estimatedSize === null || params.estimatedSize === 0) {
    return null;
  }

  return params.estimatedSize * ESTIMATED_SIZE_UNIT_BYTES;
}
