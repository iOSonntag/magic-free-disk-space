import type { ScanIssue } from '../../scan/issue.js';
import type { AdvisedApp } from '../../scan/scanPlatform.js';
import type { RegistryHive, RegistryView, UninstallKeyValues } from './win32Api.js';
import { loadUninstallKeyValues } from './win32Api.js';

/** One key whose subkeys each describe an installed app, in one view of the registry. */
export type UninstallKeySource = { hive: RegistryHive; view: RegistryView; keyPath: string };

const UNINSTALL_KEY_PATH = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';

/**
 * The keys Settings > Apps lists the apps of: the user's own, which has one view, and the
 * machine's in its 64-bit and its 32-bit view. The 32-bit view is how the machine's key reads
 * the apps of 32 bits, so `Wow6432Node` is never opened by its name.
 */
export const UNINSTALL_KEY_SOURCES: UninstallKeySource[] = [
  { hive: 'currentUser', view: 'shared', keyPath: UNINSTALL_KEY_PATH },
  { hive: 'localMachine', view: 'bits64', keyPath: UNINSTALL_KEY_PATH },
  { hive: 'localMachine', view: 'bits32', keyPath: UNINSTALL_KEY_PATH },
];

/** The `ReleaseType` values of an update of another app, which Settings > Apps does not list. */
const UPDATE_RELEASE_TYPES = ['Update', 'Hotfix', 'Security Update'];

/** `EstimatedSize` counts kilobytes. */
const ESTIMATED_SIZE_UNIT_BYTES = 1024;

const HIVE_NAMES: Record<RegistryHive, string> = {
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
      issues.push({
        path: `${HIVE_NAMES[source.hive]}\\${source.keyPath}`,
        reason: 'unexpected',
        detail: `${values.failure.call} ${values.failure.code}`,
      });

      continue;
    }

    keyValues.push(...values.value);
  }

  return { apps: decideUninstallApps({ keyValues: keyValues }), issues: issues };
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

    const identity = `${app.displayName.toLowerCase()}\n${app.installFolderPath?.toLowerCase() ?? ''}`;
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
    UPDATE_RELEASE_TYPES.includes(params.values.releaseType)
  ) {
    return null;
  }

  return {
    displayName: displayName,
    installFolderPath: cleanInstallLocation({ text: params.values.installLocation }),
    estimatedBytes: toEstimatedBytes({ estimatedSize: params.values.estimatedSize }),
  };
}

/**
 * The install folder without the quotes or the trailing backslash installers write around it;
 * `null` for none.
 */
function cleanInstallLocation(params: { text: string | null }): string | null {
  const unquoted = (params.text ?? '').trim().replace(/^"(.*)"$/, '$1');
  const folderPath = /^[A-Za-z]:\\$/.test(unquoted) ? unquoted : unquoted.replace(/\\+$/, '');

  return folderPath === '' ? null : folderPath;
}

/** A size of 0 is an installer that wrote none. */
function toEstimatedBytes(params: { estimatedSize: number | null }): number | null {
  if (params.estimatedSize === null || params.estimatedSize === 0) {
    return null;
  }

  return params.estimatedSize * ESTIMATED_SIZE_UNIT_BYTES;
}
