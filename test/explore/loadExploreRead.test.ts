import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, realpath, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPLORE_FILE_MAX_BYTES } from '../../src/explore/limits.js';
import {
  loadExploreDirectoryEntries,
  loadExploreDirectoryNames,
  loadExploreEntryStats,
  loadExploreFileText,
  loadExploreFolderNames,
  loadExploreRealPath,
} from '../../src/explore/loadExploreRead.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import { buildTestHostPath, hostPathRules } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

const PRIVACY_DENIAL_CODE = hostPlatform.system.privacyDenialCode;

describe('loadExploreRead', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  describe('loadExploreFileText', () => {
    test('returns the text of the file', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await writeFile(filePath, 'path=/avd\n');

      const read = await loadExploreFileText({
        path: filePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'text', text: 'path=/avd\n' } });
    });

    test('reads a missing file as absent', async () => {
      const read = await loadExploreFileText({
        path: join(fixtureRoot.homeDir, 'missing'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'absent' } });
    });

    test('reads a folder where a file is expected as unfit', async () => {
      const folderPath = join(fixtureRoot.homeDir, 'folder');
      await createFixtureDirectory({ path: folderPath });

      const read = await loadExploreFileText({
        path: folderPath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'unfit' } });
    });

    test('reads a file over the bound as unfit', async () => {
      const filePath = join(fixtureRoot.homeDir, 'large.json');
      await writeFile(filePath, '');
      await truncate(filePath, EXPLORE_FILE_MAX_BYTES + 1);

      const read = await loadExploreFileText({
        path: filePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'unfit' } });
    });

    testOnPosix('fails as fileUnreadable at its path when the file cannot be read', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await writeFile(filePath, 'path=/avd\n');
      await chmod(filePath, 0o000);

      try {
        const read = await loadExploreFileText({
          path: filePath,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });

        expect(read).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: filePath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(filePath, 0o600);
      }
    });
  });

  describe('loadExploreDirectoryNames', () => {
    test('returns the sorted names of the folder', async () => {
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'b') });
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'a') });

      const names = await loadExploreDirectoryNames({
        path: fixtureRoot.homeDir,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(names).toEqual({ kind: 'succeeded', value: ['a', 'b'] });
    });

    test('returns null for a missing folder and for a file', async () => {
      const filePath = join(fixtureRoot.homeDir, 'file');
      await writeFile(filePath, '');

      const missing = await loadExploreDirectoryNames({
        path: join(fixtureRoot.homeDir, 'gone'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });
      const file = await loadExploreDirectoryNames({
        path: filePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(missing).toEqual({ kind: 'succeeded', value: null });
      expect(file).toEqual({ kind: 'succeeded', value: null });
    });

    testOnPosix(
      'fails as fileUnreadable at its path when the folder cannot be listed',
      async () => {
        const folderPath = join(fixtureRoot.homeDir, 'locked');
        await createFixtureDirectory({ path: folderPath });
        await chmod(folderPath, 0o000);

        try {
          const names = await loadExploreDirectoryNames({
            path: folderPath,
            privacyDenialCode: PRIVACY_DENIAL_CODE,
          });

          expect(names).toEqual({
            kind: 'failed',
            failure: {
              reason: 'fileUnreadable',
              path: folderPath,
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          });
        } finally {
          await chmod(folderPath, 0o700);
        }
      },
    );
  });

  describe('loadExploreDirectoryEntries', () => {
    test('returns the entries with their kinds, and null for a missing folder', async () => {
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'folder') });
      await writeFile(join(fixtureRoot.homeDir, 'file'), '');

      const entries = await loadExploreDirectoryEntries({
        path: fixtureRoot.homeDir,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });
      const missing = await loadExploreDirectoryEntries({
        path: join(fixtureRoot.homeDir, 'gone'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(entries).toEqual({
        kind: 'succeeded',
        value: [
          { name: 'file', kind: 'file' },
          { name: 'folder', kind: 'directory' },
        ],
      });
      expect(missing).toEqual({ kind: 'succeeded', value: null });
    });
  });

  describe('loadExploreFolderNames', () => {
    testOnPosix(
      'keeps folders apart from links, each sorted, and leaves out dot names and files',
      async () => {
        await createFixtureDirectory({ path: join(fixtureRoot.homeDir, '22.1.0') });
        await createFixtureDirectory({ path: join(fixtureRoot.homeDir, '20.11.1') });
        await createFixtureDirectory({ path: join(fixtureRoot.homeDir, '.hidden') });
        await writeFile(join(fixtureRoot.homeDir, '.DS_Store'), '');
        await writeFile(join(fixtureRoot.homeDir, 'notes.txt'), '');
        await symlink('./22.1.0', join(fixtureRoot.homeDir, 'latest'));
        await symlink('./20.11.1', join(fixtureRoot.homeDir, '20'));
        await symlink('./gone', join(fixtureRoot.homeDir, '.dangling'));

        const names = await loadExploreFolderNames({
          path: fixtureRoot.homeDir,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });

        expect(names).toEqual({
          kind: 'succeeded',
          value: { folderNames: ['20.11.1', '22.1.0'], linkNames: ['20', 'latest'] },
        });
      },
    );

    test('returns null for a missing folder and for a file', async () => {
      const filePath = join(fixtureRoot.homeDir, 'file');
      await writeFile(filePath, '');

      const missing = await loadExploreFolderNames({
        path: join(fixtureRoot.homeDir, 'gone'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });
      const file = await loadExploreFolderNames({
        path: filePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(missing).toEqual({ kind: 'succeeded', value: null });
      expect(file).toEqual({ kind: 'succeeded', value: null });
    });

    testOnPosix(
      'fails as fileUnreadable at its path when the folder cannot be listed',
      async () => {
        const folderPath = join(fixtureRoot.homeDir, 'locked');
        await createFixtureDirectory({ path: folderPath });
        await chmod(folderPath, 0o000);

        try {
          const names = await loadExploreFolderNames({
            path: folderPath,
            privacyDenialCode: PRIVACY_DENIAL_CODE,
          });

          expect(names).toEqual({
            kind: 'failed',
            failure: {
              reason: 'fileUnreadable',
              path: folderPath,
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          });
        } finally {
          await chmod(folderPath, 0o700);
        }
      },
    );
  });

  describe('loadExploreEntryStats', () => {
    test('returns the stats of the entry, and null for a missing one', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await createFixtureFile({ path: filePath, sizeBytes: 1, modifiedMs: 1_000_000 });

      const stats = await loadExploreEntryStats({
        path: filePath,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });
      const missing = await loadExploreEntryStats({
        path: join(fixtureRoot.homeDir, 'gone'),
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(stats.kind === 'succeeded' ? stats.value?.modifiedMs : undefined).toBe(1_000_000);
      expect(missing).toEqual({ kind: 'succeeded', value: null });
    });
  });

  describe('loadExploreRealPath', () => {
    testOnPosix(
      'resolves a link, and returns null for a missing path and one under a file',
      async () => {
        const folderPath = join(fixtureRoot.homeDir, 'folder');
        const linkPath = join(fixtureRoot.homeDir, 'link');
        const filePath = join(fixtureRoot.homeDir, 'file');
        await createFixtureDirectory({ path: folderPath });
        await symlink(folderPath, linkPath);
        await writeFile(filePath, '');

        const linked = await loadExploreRealPath({
          pathRules: hostPathRules,
          path: linkPath,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });
        const missing = await loadExploreRealPath({
          pathRules: hostPathRules,
          path: join(fixtureRoot.homeDir, 'gone'),
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });
        const underFile = await loadExploreRealPath({
          pathRules: hostPathRules,
          path: join(filePath, 'child'),
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        });

        expect(linked).toEqual({
          kind: 'succeeded',
          value: buildTestHostPath({ text: await realpath(folderPath) }),
        });
        expect(missing).toEqual({ kind: 'succeeded', value: null });
        expect(underFile).toEqual({ kind: 'succeeded', value: null });
      },
    );

    testOnPosix(
      'fails as fileUnreadable at its path when a folder on it cannot be searched',
      async () => {
        const folderPath = join(fixtureRoot.homeDir, 'locked');
        const childPath = join(folderPath, 'child');
        await createFixtureDirectory({ path: childPath });
        await chmod(folderPath, 0o000);

        try {
          const realPath = await loadExploreRealPath({
            pathRules: hostPathRules,
            path: childPath,
            privacyDenialCode: PRIVACY_DENIAL_CODE,
          });

          expect(realPath).toEqual({
            kind: 'failed',
            failure: {
              reason: 'fileUnreadable',
              path: childPath,
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          });
        } finally {
          await chmod(folderPath, 0o700);
        }
      },
    );

    test('fails as fileUnreadable at its path when its real path is no absolute path under the rules', async () => {
      // The rules of the other platform, under which no real path of the host is absolute.
      const otherRules = hostPathRules === WIN32_PATH_RULES ? POSIX_PATH_RULES : WIN32_PATH_RULES;

      expect(
        await loadExploreRealPath({
          pathRules: otherRules,
          path: fixtureRoot.homeDir,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
        }),
      ).toEqual({
        kind: 'failed',
        failure: {
          reason: 'fileUnreadable',
          path: fixtureRoot.homeDir,
          failure: { reason: 'unexpected', code: 'notAbsolute' },
        },
      });
    });
  });
});
