import { describe, expect, test } from 'bun:test';
import {
  buildUninstallKeyIssue,
  decideUninstallApps,
  loadAdvisedApps,
  uninstallKeySources,
} from '../../../src/platform/win32/loadAdvisedApps.js';
import type { UninstallKeyValues } from '../../../src/platform/win32/win32Api.js';
import { loadUninstallKeyValues } from '../../../src/platform/win32/win32Api.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';
import { describeOnWindows } from '../../support/windowsOnly.js';
import { deleteRegistryKey, saveRegistryValue } from '../../support/windowsRegistry.js';

/** The values of an Uninstall subkey of an app Settings > Apps lists, with `overrides` on top. */
function buildKeyValues(overrides: Partial<UninstallKeyValues>): UninstallKeyValues {
  return {
    keyName: 'ExampleApp',
    displayName: 'Example App',
    uninstallString: '"C:\\Program Files\\Example\\uninstall.exe"',
    installLocation: 'C:\\Program Files\\Example',
    estimatedSize: null,
    systemComponent: null,
    parentKeyName: null,
    releaseType: null,
    ...overrides,
  };
}

describe('decideUninstallApps', () => {
  test('lists an app by its name, its install folder, and its size counted in KB', () => {
    expect(decideUninstallApps({ keyValues: [buildKeyValues({ estimatedSize: 2048 })] })).toEqual([
      {
        displayName: 'Example App',
        installFolderPath: buildTestWindowsPath({ text: 'C:\\Program Files\\Example' }),
        estimatedBytes: 2048 * 1024,
      },
    ]);
  });

  test('leaves out a subkey without a name or an uninstall command', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ displayName: null }),
          buildKeyValues({ displayName: '  ' }),
          buildKeyValues({ uninstallString: null }),
          buildKeyValues({ uninstallString: '' }),
        ],
      }),
    ).toEqual([]);
  });

  test('leaves out a system component, a part of another app, and an update', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ systemComponent: 1 }),
          buildKeyValues({ parentKeyName: 'OfficeSuite' }),
          buildKeyValues({ releaseType: 'Update' }),
          buildKeyValues({ releaseType: 'Hotfix' }),
          buildKeyValues({ releaseType: 'Security Update' }),
        ],
      }),
    ).toEqual([]);
  });

  test('keeps a subkey whose flags mark no component, part, or update', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ systemComponent: 0, parentKeyName: ' ', releaseType: 'Application' }),
        ],
      }),
    ).toHaveLength(1);
  });

  test('cleans the quotes and the trailing backslash of an install folder, but keeps a drive root', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ displayName: 'Quoted', installLocation: '"C:\\Tools\\Quoted\\"' }),
          buildKeyValues({ displayName: 'Root', installLocation: 'D:\\' }),
          buildKeyValues({ displayName: 'Slashed', installLocation: 'e:/Tools/Slashed/' }),
          buildKeyValues({ displayName: 'None', installLocation: '' }),
          buildKeyValues({ displayName: 'Missing', installLocation: null }),
        ],
      }).map((app) => app.installFolderPath),
    ).toEqual([
      buildTestWindowsPath({ text: 'C:\\Tools\\Quoted' }),
      buildTestWindowsPath({ text: 'D:\\' }),
      buildTestWindowsPath({ text: 'E:\\Tools\\Slashed' }),
      null,
      null,
    ]);
  });

  test('names no install folder for a text that is no absolute Windows path', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ displayName: 'Relative', installLocation: 'Tools\\Relative' }),
          buildKeyValues({ displayName: 'Drive relative', installLocation: 'C:Tools' }),
          buildKeyValues({ displayName: 'Share', installLocation: '\\\\server\\apps\\Share' }),
        ],
      }).map((app) => app.installFolderPath),
    ).toEqual([null, null, null]);
  });

  test('takes a size of 0 for none', () => {
    expect(
      decideUninstallApps({ keyValues: [buildKeyValues({ estimatedSize: 0 })] })[0]?.estimatedBytes,
    ).toBeNull();
  });

  test('lists an app of two views once by its name and folder, with the first size any gives', () => {
    expect(
      decideUninstallApps({
        keyValues: [
          buildKeyValues({ estimatedSize: null }),
          buildKeyValues({ displayName: 'EXAMPLE APP', estimatedSize: 100 }),
          buildKeyValues({ estimatedSize: 200 }),
          buildKeyValues({ installLocation: 'C:\\Other\\Example', estimatedSize: 300 }),
        ],
      }),
    ).toEqual([
      {
        displayName: 'Example App',
        installFolderPath: buildTestWindowsPath({ text: 'C:\\Program Files\\Example' }),
        estimatedBytes: 100 * 1024,
      },
      {
        displayName: 'Example App',
        installFolderPath: buildTestWindowsPath({ text: 'C:\\Other\\Example' }),
        estimatedBytes: 300 * 1024,
      },
    ]);
  });
});

describe('buildUninstallKeyIssue', () => {
  test('names the key by its hive and the failed call with its code in hex', () => {
    expect(
      buildUninstallKeyIssue({
        source: { hive: 'localMachine', view: 'bits64', keyPath: 'Software\\Example\\Uninstall' },
        failure: { call: 'RegOpenKeyExW', code: 5 },
      }),
    ).toEqual({
      path: 'HKEY_LOCAL_MACHINE\\Software\\Example\\Uninstall',
      reason: 'unexpected',
      detail: 'RegOpenKeyExW failed with 0x00000005',
    });
  });
});

describeOnWindows('the Uninstall keys of Windows', () => {
  test('opens each key Settings > Apps lists', () => {
    for (const source of uninstallKeySources) {
      expect(loadUninstallKeyValues(source).kind).toBe('succeeded');
    }
  });

  // The windows-2025 image holds apps of 64 bits and the Visual C++ runtimes of 32 bits.
  test('reads the apps of the machine in its 64-bit and its 32-bit view, each its own', () => {
    const keyNamesByView = new Map<string, string[]>();

    for (const source of uninstallKeySources) {
      const values = loadUninstallKeyValues(source);

      if (source.hive === 'localMachine' && values.kind === 'succeeded') {
        keyNamesByView.set(
          source.view,
          values.value.map((value) => value.keyName),
        );
      }
    }

    const bits64KeyNames = keyNamesByView.get('bits64') ?? [];
    const bits32KeyNames = keyNamesByView.get('bits32') ?? [];

    expect(bits64KeyNames.length).toBeGreaterThan(0);
    expect(bits32KeyNames.length).toBeGreaterThan(0);
    expect(bits32KeyNames.toSorted()).not.toEqual(bits64KeyNames.toSorted());
  });

  test('takes a key that does not exist for one with no subkeys', () => {
    expect(
      loadUninstallKeyValues({
        hive: 'currentUser',
        view: 'shared',
        keyPath: `Software\\magic-free-disk-space-absent-${process.pid}\\Uninstall`,
      }),
    ).toEqual({ kind: 'succeeded', value: [] });
  });

  test('lists the app of a fixture key of the user, and not its system component', async () => {
    const rootKeyPath = `Software\\magic-free-disk-space-test-${process.pid}`;
    const keyPath = `${rootKeyPath}\\Uninstall`;
    const appKey = `HKCU\\${keyPath}\\FixtureApp`;
    const componentKey = `HKCU\\${keyPath}\\FixtureComponent`;

    try {
      for (const value of [
        { key: appKey, valueName: 'DisplayName', type: 'REG_SZ', data: 'Fixture App' },
        { key: appKey, valueName: 'UninstallString', type: 'REG_SZ', data: 'C:\\Fixture\\u.exe' },
        { key: appKey, valueName: 'InstallLocation', type: 'REG_SZ', data: 'C:\\Fixture\\App\\' },
        { key: appKey, valueName: 'EstimatedSize', type: 'REG_DWORD', data: '2048' },
        { key: componentKey, valueName: 'DisplayName', type: 'REG_SZ', data: 'Fixture Part' },
        { key: componentKey, valueName: 'UninstallString', type: 'REG_SZ', data: 'x.exe' },
        { key: componentKey, valueName: 'SystemComponent', type: 'REG_DWORD', data: '1' },
      ] as const) {
        saveRegistryValue(value);
      }

      expect(
        await loadAdvisedApps({
          sources: [{ hive: 'currentUser', view: 'shared', keyPath: keyPath }],
        }),
      ).toEqual({
        apps: [
          {
            displayName: 'Fixture App',
            installFolderPath: buildTestWindowsPath({ text: 'C:\\Fixture\\App' }),
            estimatedBytes: 2048 * 1024,
          },
        ],
        issues: [],
      });
    } finally {
      deleteRegistryKey({ key: `HKCU\\${rootKeyPath}` });
    }
  });
});
