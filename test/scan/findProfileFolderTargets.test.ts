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
  withFixtureRoot,
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
    await withFixtureRoot({
      run: async (fixtureRoot) => {
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
      },
    });
  });

  test('gives the folder itself an item of its root subpaths, though it holds no marker', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const userDataPath = join(fixtureRoot.homeDir, 'Browser');
        const defaultPath = join(userDataPath, 'Default');
        await createFixtureDirectory({ path: join(userDataPath, 'ShaderCache') });
        await createFakeProfile({
          profilePath: defaultPath,
          subpaths: ['ShaderCache', 'GPUCache'],
        });

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
      },
    });
  });

  test('takes the folder itself as the profile when it holds the marker', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
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
      },
    });
  });

  test('skips a folder without the marker, a file, and a profile with no subpath', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
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
      },
    });
  });

  test('takes every folder as a profile for a null marker', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const selection: CatalogSelectionProfileFolders = {
          kind: 'profileFolders',
          markerName: null,
          subpaths: ['com.apple.metal', 'com.apple.metalfe'],
          rootSubpaths: [],
        };
        const entry = buildTestCatalogEntry({ selection: selection });
        const appPath = join(fixtureRoot.userCacheDir, 'com.example.app');
        await createFixtureDirectory({ path: join(appPath, 'com.apple.metal') });
        await createFixtureDirectory({ path: join(appPath, 'com.apple.metalfe') });
        await createFixtureDirectory({
          path: join(fixtureRoot.userCacheDir, 'com.example.other'),
        });

        const result = await findProfileFolderTargets({
          entry: entry,
          selection: selection,
          path: fixtureRoot.userCacheDir,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });

        expect(result).toEqual({
          targets: [
            {
              entry: entry,
              path: appPath,
              targetPaths: [join(appPath, 'com.apple.metal'), join(appPath, 'com.apple.metalfe')],
            },
          ],
          issues: [],
        });
      },
    });
  });

  test('a missing folder adds nothing', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const result = await findProfileFolderTargets({
          entry: ENTRY,
          selection: SELECTION,
          path: join(fixtureRoot.homeDir, 'Absent'),
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });

        expect(result).toEqual({ targets: [], issues: [] });
      },
    });
  });

  testOnPosix('an unreadable folder gives a permissionDenied issue', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
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
      },
    });
  });

  testOnPosix('an unreadable profile gives an issue, and the others count', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
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
      },
    });
  });
});
