import { describe, expect, test } from 'bun:test';
import {
  buildUninstallKeyIssue,
  decideUninstallApps,
  loadAdvisedApps,
  UNINSTALL_KEY_SOURCES,
} from '../../../src/platform/win32/loadAdvisedApps.js';
import type { UninstallKeyValues } from '../../../src/platform/win32/win32Api.js';
import { loadUninstallKeyValues } from '../../../src/platform/win32/win32Api.js';

/** The values of an Uninstall subkey of an app Settings > Apps lists, with `overrides` on top. */
function buildKeyValues(overrides: Partial<UninstallKeyValues> = {}): UninstallKeyValues {
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
        installFolderPath: 'C:\\Program Files\\Example',
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
          buildKeyValues({ displayName: 'None', installLocation: '' }),
          buildKeyValues({ displayName: 'Missing', installLocation: null }),
        ],
      }).map((app) => app.installFolderPath),
    ).toEqual(['C:\\Tools\\Quoted', 'D:\\', null, null]);
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
        installFolderPath: 'C:\\Program Files\\Example',
        estimatedBytes: 100 * 1024,
      },
      {
        displayName: 'Example App',
        installFolderPath: 'C:\\Other\\Example',
        estimatedBytes: 300 * 1024,
      },
    ]);
  });
});

/** Writes one value of a registry key through `reg.exe`, the key made if missing, or fails the test. */
function addRegistryValue(params: {
  key: string;
  name: string;
  type: 'REG_SZ' | 'REG_DWORD';
  data: string;
}): void {
  const result = Bun.spawnSync(
    ['reg', 'add', params.key, '/v', params.name, '/t', params.type, '/d', params.data, '/f'],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  if (result.exitCode !== 0) {
    throw new Error(`reg add failed: ${result.stderr.toString()}`);
  }
}

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

describe.skipIf(process.platform !== 'win32')('the Uninstall keys of Windows', () => {
  test('opens the key of the machine in its 64-bit and its 32-bit view', () => {
    for (const source of UNINSTALL_KEY_SOURCES) {
      expect(loadUninstallKeyValues(source).kind).toBe('succeeded');
    }
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
        { key: appKey, name: 'DisplayName', type: 'REG_SZ', data: 'Fixture App' },
        { key: appKey, name: 'UninstallString', type: 'REG_SZ', data: 'C:\\Fixture\\u.exe' },
        { key: appKey, name: 'InstallLocation', type: 'REG_SZ', data: 'C:\\Fixture\\App\\' },
        { key: appKey, name: 'EstimatedSize', type: 'REG_DWORD', data: '2048' },
        { key: componentKey, name: 'DisplayName', type: 'REG_SZ', data: 'Fixture Part' },
        { key: componentKey, name: 'UninstallString', type: 'REG_SZ', data: 'x.exe' },
        { key: componentKey, name: 'SystemComponent', type: 'REG_DWORD', data: '1' },
      ] as const) {
        addRegistryValue(value);
      }

      expect(
        await loadAdvisedApps({
          sources: [{ hive: 'currentUser', view: 'shared', keyPath: keyPath }],
        }),
      ).toEqual({
        apps: [
          {
            displayName: 'Fixture App',
            installFolderPath: 'C:\\Fixture\\App',
            estimatedBytes: 2048 * 1024,
          },
        ],
        issues: [],
      });
    } finally {
      Bun.spawnSync(['reg', 'delete', `HKCU\\${rootKeyPath}`, '/f'], {
        stdout: 'ignore',
        stderr: 'ignore',
      });
    }
  });
});
