import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildSignOfUsePaths, findLastSignOfUse } from '../../src/scan/findLastSignOfUse.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  updateModifiedMs,
} from '../support/fixtureRoot.js';

const BUNDLE_ID = 'com.example.fixture';
const DISPLAY_NAME = 'Fixture App';
const OLDEST_MS = 1_600_000_000_000;
const MIDDLE_MS = 1_650_000_000_000;
const NEWEST_MS = 1_700_000_000_000;

describe('buildSignOfUsePaths', () => {
  test('lists the bundle id places and the display-name place, in and outside the container', () => {
    const paths = buildSignOfUsePaths({
      homeDir: '/fixture/home',
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });
    const containerLibrary = '/fixture/home/Library/Containers/com.example.fixture/Data/Library';

    expect(paths).toEqual([
      '/fixture/home/Library/Preferences/com.example.fixture.plist',
      '/fixture/home/Library/Saved Application State/com.example.fixture.savedState',
      '/fixture/home/Library/Caches/com.example.fixture',
      '/fixture/home/Library/Application Support/com.example.fixture',
      '/fixture/home/Library/Application Support/Fixture App',
      '/fixture/home/Library/Containers/com.example.fixture',
      `${containerLibrary}/Preferences/com.example.fixture.plist`,
      `${containerLibrary}/Saved Application State/com.example.fixture.savedState`,
      `${containerLibrary}/Caches/com.example.fixture`,
      `${containerLibrary}/Application Support/com.example.fixture`,
      `${containerLibrary}/Application Support/Fixture App`,
    ]);
  });

  test('lists only the display-name place when the app has no bundle id', () => {
    const paths = buildSignOfUsePaths({
      homeDir: '/fixture/home',
      bundleId: null,
      displayName: DISPLAY_NAME,
    });

    expect(paths).toEqual(['/fixture/home/Library/Application Support/Fixture App']);
  });
});

describe('findLastSignOfUse', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('returns the newest modification time among the places of the app', async () => {
    const libraryDir = join(fixtureRoot.homeDir, 'Library');
    const preferencesPath = join(libraryDir, 'Preferences', `${BUNDLE_ID}.plist`);
    const savedStatePath = join(libraryDir, 'Saved Application State', `${BUNDLE_ID}.savedState`);
    const cachePath = join(libraryDir, 'Caches', BUNDLE_ID);
    const supportPath = join(libraryDir, 'Application Support', DISPLAY_NAME);

    await createFixtureDirectory({ path: join(libraryDir, 'Preferences') });
    await createFixtureFile({ path: preferencesPath, sizeBytes: 0, modifiedMs: OLDEST_MS });
    await createFixtureDirectory({ path: savedStatePath });
    await updateModifiedMs({ path: savedStatePath, modifiedMs: MIDDLE_MS });
    await createFixtureDirectory({ path: cachePath });
    await updateModifiedMs({ path: cachePath, modifiedMs: NEWEST_MS });
    await createFixtureDirectory({ path: supportPath });
    await updateModifiedMs({ path: supportPath, modifiedMs: MIDDLE_MS });

    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBe(NEWEST_MS);
  });

  test('sees a newer child inside the container folder of the app', async () => {
    const containerPath = join(fixtureRoot.homeDir, 'Library', 'Containers', BUNDLE_ID);
    const dataPath = join(containerPath, 'Data');

    await createFixtureDirectory({ path: dataPath });
    await updateModifiedMs({ path: dataPath, modifiedMs: NEWEST_MS });
    await updateModifiedMs({ path: containerPath, modifiedMs: OLDEST_MS });

    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBe(NEWEST_MS);
  });

  test('sees the preferences that a sandboxed app writes inside its container', async () => {
    const containerPath = join(fixtureRoot.homeDir, 'Library', 'Containers', BUNDLE_ID);
    const preferencesDir = join(containerPath, 'Data/Library/Preferences');

    await createFixtureDirectory({ path: preferencesDir });
    await createFixtureFile({
      path: join(preferencesDir, `${BUNDLE_ID}.plist`),
      sizeBytes: 0,
      modifiedMs: NEWEST_MS,
    });

    for (const path of [
      preferencesDir,
      join(containerPath, 'Data/Library'),
      join(containerPath, 'Data'),
      containerPath,
    ]) {
      await updateModifiedMs({ path: path, modifiedMs: OLDEST_MS });
    }

    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBe(NEWEST_MS);
  });

  test('uses the display-name folder when the app has no bundle id', async () => {
    const supportPath = join(fixtureRoot.homeDir, 'Library', 'Application Support', DISPLAY_NAME);

    await createFixtureDirectory({ path: supportPath });
    await updateModifiedMs({ path: supportPath, modifiedMs: NEWEST_MS });

    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: null,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBe(NEWEST_MS);
  });

  test('reads at most 200 children of a folder, in sorted order', async () => {
    const containerPath = join(fixtureRoot.homeDir, 'Library', 'Containers', BUNDLE_ID);
    const childNames = Array.from(
      { length: 201 },
      (_, index) => `child-${String(index).padStart(3, '0')}`,
    );

    await createFixtureDirectory({ path: containerPath });
    await Promise.all(
      childNames.map((childName) =>
        createFixtureFile({
          path: join(containerPath, childName),
          sizeBytes: 0,
          modifiedMs: OLDEST_MS,
        }),
      ),
    );
    await updateModifiedMs({ path: join(containerPath, 'child-199'), modifiedMs: MIDDLE_MS });
    await updateModifiedMs({ path: join(containerPath, 'child-200'), modifiedMs: NEWEST_MS });
    await updateModifiedMs({ path: containerPath, modifiedMs: OLDEST_MS });

    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBe(MIDDLE_MS);
  });

  test('returns null when no place of the app exists', async () => {
    const lastSignOfUse = await findLastSignOfUse({
      homeDir: fixtureRoot.homeDir,
      bundleId: BUNDLE_ID,
      displayName: DISPLAY_NAME,
    });

    expect(lastSignOfUse).toBeNull();
  });
});
