import { expect, test } from 'bun:test';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, CatalogSelectionProfileFolders } from '../../src/catalog/catalog.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { findProfileFolderTargets } from '../../src/scan/findProfileFolderTargets.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

const PRIVACY_DENIAL_CODE = darwinPlatform.system.privacyDenialCode;

const SELECTION: CatalogSelectionProfileFolders = {
  kind: 'profileFolders',
  markerName: 'Preferences',
  subpaths: ['GPUCache', 'Code Cache', 'Service Worker/CacheStorage'],
  rootSubpaths: ['ShaderCache'],
};

const ENTRY: CatalogEntry = buildTestCatalogEntry({ selection: SELECTION });

/** Writes a fake browser profile: the marker file, and an empty folder for each subpath. */
async function createFakeProfile(params: {
  profilePath: string;
  subpaths: string[];
}): Promise<void> {
  await writeFixtureTextFile({ path: join(params.profilePath, 'Preferences'), text: '{}' });

  for (const subpath of params.subpaths) {
    await createFixtureDirectory({ path: join(params.profilePath, subpath) });
  }
}

describeAwaitingWin32Platform('findProfileFolderTargets', () => {
  test('gives one item per profile, its targets the subpaths that exist in it', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const userDataPath = join(fixtureRoot.homeDir, 'Browser');
      const defaultPath = join(userDataPath, 'Default');
      const secondPath = join(userDataPath, 'Profile 1');
      await createFakeProfile({
        profilePath: defaultPath,
        subpaths: ['GPUCache', 'Service Worker/CacheStorage'],
      });
      await createFakeProfile({ profilePath: secondPath, subpaths: ['Code Cache'] });

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: userDataPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [
          {
            entry: ENTRY,
            path: defaultPath,
            targetPaths: [
              join(defaultPath, 'GPUCache'),
              join(defaultPath, 'Service Worker/CacheStorage'),
            ],
          },
          { entry: ENTRY, path: secondPath, targetPaths: [join(secondPath, 'Code Cache')] },
        ],
        issues: [],
      });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  test('gives the folder itself an item of its root subpaths, though it holds no marker', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const userDataPath = join(fixtureRoot.homeDir, 'Browser');
      const defaultPath = join(userDataPath, 'Default');
      await createFixtureDirectory({ path: join(userDataPath, 'ShaderCache') });
      await createFakeProfile({ profilePath: defaultPath, subpaths: ['ShaderCache', 'GPUCache'] });

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: userDataPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [
          { entry: ENTRY, path: userDataPath, targetPaths: [join(userDataPath, 'ShaderCache')] },
          { entry: ENTRY, path: defaultPath, targetPaths: [join(defaultPath, 'GPUCache')] },
        ],
        issues: [],
      });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  test('takes the folder itself as the profile when it holds the marker', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const profilePath = join(fixtureRoot.homeDir, 'Browser');
      await createFakeProfile({ profilePath: profilePath, subpaths: ['GPUCache'] });

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: profilePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [
          { entry: ENTRY, path: profilePath, targetPaths: [join(profilePath, 'GPUCache')] },
        ],
        issues: [],
      });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  test('skips a folder without the marker, a file, and a profile with no subpath', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const userDataPath = join(fixtureRoot.homeDir, 'Browser');
      await createFixtureDirectory({ path: join(userDataPath, 'Crashpad', 'GPUCache') });
      await writeFixtureTextFile({ path: join(userDataPath, 'Local State'), text: '{}' });
      await createFakeProfile({ profilePath: join(userDataPath, 'Default'), subpaths: [] });

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: userDataPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({ targets: [], issues: [] });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  test('a missing folder adds nothing', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: join(fixtureRoot.homeDir, 'Absent'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({ targets: [], issues: [] });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  testOnPosix('an unreadable folder gives a permissionDenied issue', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const lockedPath = join(fixtureRoot.homeDir, 'Locked');
      await createFixtureDirectory({ path: lockedPath });
      await chmod(lockedPath, 0o000);

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: lockedPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [],
        issues: [{ path: lockedPath, reason: 'permissionDenied', detail: 'EACCES' }],
      });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });

  testOnPosix('an unreadable profile gives an issue, and the others count', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const userDataPath = join(fixtureRoot.homeDir, 'Browser');
      const lockedPath = join(userDataPath, 'Default');
      const openPath = join(userDataPath, 'Profile 1');
      await createFakeProfile({ profilePath: lockedPath, subpaths: ['GPUCache'] });
      await createFakeProfile({ profilePath: openPath, subpaths: ['GPUCache'] });
      await chmod(lockedPath, 0o000);

      const result = await findProfileFolderTargets({
        entry: ENTRY,
        selection: SELECTION,
        path: userDataPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [{ entry: ENTRY, path: openPath, targetPaths: [join(openPath, 'GPUCache')] }],
        issues: [
          {
            path: join(lockedPath, 'Preferences'),
            reason: 'permissionDenied',
            detail: 'EACCES',
          },
        ],
      });
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });
});
