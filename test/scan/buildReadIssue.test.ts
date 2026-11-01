import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildFailureIssues, buildReadIssue } from '../../src/scan/buildReadIssue.js';
import { loadDirectoryNames } from '../../src/system/loadDirectoryNames.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

describe('buildReadIssue', () => {
  test('reports the path with the reason of the failure and its code as the detail', () => {
    expect(
      buildReadIssue({
        path: '/Users/example/Library/Locked',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      }),
    ).toEqual({
      path: '/Users/example/Library/Locked',
      reason: 'permissionDenied',
      detail: 'EACCES',
    });
    expect(
      buildReadIssue({
        path: '/Users/example/Loop/inside',
        failure: { reason: 'unexpected', code: 'ELOOP' },
      }),
    ).toEqual({ path: '/Users/example/Loop/inside', reason: 'unexpected', detail: 'ELOOP' });
  });
});

describe('buildFailureIssues', () => {
  test('reports a denial by macOS privacy protection as privacyDenied', () => {
    expect(
      buildFailureIssues({
        path: '/Users/example/Library/Containers',
        failure: { reason: 'permissionDenied', code: 'EPERM' },
      }),
    ).toEqual([
      { path: '/Users/example/Library/Containers', reason: 'privacyDenied', detail: 'EPERM' },
    ]);
  });

  test('reports a POSIX denial as permissionDenied', () => {
    expect(
      buildFailureIssues({
        path: '/Users/example/Library/Containers',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      }),
    ).toEqual([
      { path: '/Users/example/Library/Containers', reason: 'permissionDenied', detail: 'EACCES' },
    ]);
  });

  test('reports nothing for a missing path or a path through a file', () => {
    expect(
      buildFailureIssues({
        path: '/Users/example/Library/Containers',
        failure: { reason: 'missing', code: 'ENOENT' },
      }),
    ).toEqual([]);
    expect(
      buildFailureIssues({
        path: '/Users/example/Library/Containers',
        failure: { reason: 'notDirectory', code: 'ENOTDIR' },
      }),
    ).toEqual([]);
  });

  describe('on a folder listing as the orphan phase reads it', () => {
    let fixtureRoot: FixtureRoot;

    beforeEach(async () => {
      fixtureRoot = await createFixtureRoot();
    });

    afterEach(async () => {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    });

    test('keeps a folder without read permission as permissionDenied with its code', async () => {
      const containersPath = join(fixtureRoot.homeDir, 'Library/Containers');
      await mkdir(containersPath, { recursive: true });
      await chmod(containersPath, 0o000);

      try {
        const names = await loadDirectoryNames({ path: containersPath });

        if (names.kind !== 'failed') {
          throw new Error('expected the listing of a folder with mode 000 to fail');
        }

        expect(buildFailureIssues({ path: containersPath, failure: names.failure })).toEqual([
          { path: containersPath, reason: 'permissionDenied', detail: 'EACCES' },
        ]);
      } finally {
        await chmod(containersPath, 0o755);
      }
    });
  });
});
