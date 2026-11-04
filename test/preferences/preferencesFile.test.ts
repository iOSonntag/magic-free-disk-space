import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  buildPreferencesPath,
  loadPreferences,
  saveIsUpdateCheckEnabled,
} from '../../src/preferences/preferencesFile.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

let fixtureRoot: FixtureRoot;
let preferencesPath: string;
let preferencesDir: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  preferencesDir = (await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: 0 }))
    .preferencesDir;
  preferencesPath = buildPreferencesPath({ preferencesDir: preferencesDir });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function writePreferencesFile(text: string): Promise<void> {
  await mkdir(preferencesDir, { recursive: true });
  await writeFile(preferencesPath, text);
}

describeAwaitingWin32Platform('loadPreferences', () => {
  test('lives in the support folder of the app', () => {
    expect(preferencesPath).toBe(
      join(
        fixtureRoot.homeDir,
        'Library/Application Support/magic-free-disk-space/preferences.json',
      ),
    );
  });

  test('is on without a file', async () => {
    expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
      isUpdateCheckEnabled: true,
    });
  });

  test('is on for a file it cannot use', async () => {
    const texts = [
      '',
      'not json',
      '[false]',
      'false',
      '{}',
      '{"isUpdateCheckEnabled":"false"}',
      '{"isUpdateCheckEnabled":0}',
      '{"isUpdateCheckEnabled":null}',
      `{"isUpdateCheckEnabled":false,"padding":"${'x'.repeat(70_000)}"}`,
    ];

    for (const text of texts) {
      await writePreferencesFile(text);

      expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
        isUpdateCheckEnabled: true,
      });
    }
  });

  testOnPosix('is on for a file it may not read', async () => {
    await writePreferencesFile('{"isUpdateCheckEnabled":false}');
    await chmod(preferencesPath, 0o000);

    expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
      isUpdateCheckEnabled: true,
    });
  });

  test('reads the saved value', async () => {
    await writePreferencesFile('{"isUpdateCheckEnabled":false}');

    expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
      isUpdateCheckEnabled: false,
    });
  });
});

describeAwaitingWin32Platform('saveIsUpdateCheckEnabled', () => {
  test('saves the value for the next load, in a private folder and file', async () => {
    expect(
      await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: false }),
    ).toEqual({ kind: 'succeeded', value: null });
    expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
      isUpdateCheckEnabled: false,
    });
    expect((await stat(preferencesDir)).mode & 0o777).toBe(0o700);
    expect((await stat(preferencesPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(preferencesDir)).toEqual(['preferences.json']);

    await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: true });

    expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
      isUpdateCheckEnabled: true,
    });
  });

  test('keeps every key it does not know', async () => {
    await writePreferencesFile('{"isUpdateCheckEnabled":true,"theme":"dark","limits":{"days":30}}');

    await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: false });

    expect(JSON.parse(await readFile(preferencesPath, 'utf8'))).toEqual({
      isUpdateCheckEnabled: false,
      theme: 'dark',
      limits: { days: 30 },
    });
  });

  test('replaces a file that holds no object', async () => {
    await writePreferencesFile('[1, 2]');

    await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: false });

    expect(JSON.parse(await readFile(preferencesPath, 'utf8'))).toEqual({
      isUpdateCheckEnabled: false,
    });
  });

  testOnPosix(
    'fails with writeFailed in a folder it may not write, and keeps the file',
    async () => {
      await writePreferencesFile('{"isUpdateCheckEnabled":true}');
      await chmod(preferencesDir, 0o500);

      expect(
        await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: false }),
      ).toEqual({ kind: 'failed', failure: { reason: 'writeFailed', code: 'EACCES' } });
      expect(await loadPreferences({ preferencesDir: preferencesDir })).toEqual({
        isUpdateCheckEnabled: true,
      });
    },
  );

  test('fails with directoryUnavailable when a file stands where the folder belongs', async () => {
    await mkdir(join(preferencesDir, '..'), { recursive: true });
    await writeFile(preferencesDir, 'a file where the folder belongs');

    expect(
      await saveIsUpdateCheckEnabled({ preferencesDir: preferencesDir, isEnabled: false }),
    ).toMatchObject({ kind: 'failed', failure: { reason: 'directoryUnavailable' } });
  });
});
