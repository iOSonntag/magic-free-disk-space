import { expect, test } from 'bun:test';
import { validateRemoval } from '../../src/delete/validateRemoval.js';
import { buildDarwinEnvironment } from '../../src/platform/darwin/loadEnvironment.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate } from '../support/candidateFixtures.js';
import {
  buildTestEvictCandidate,
  buildTestEvictTarget,
} from '../support/evictCandidateFixtures.js';
import { buildTestAbsolutePath, buildTestUserIdentity } from '../support/parsedValueFixtures.js';

const ENVIRONMENT = buildDarwinEnvironment({
  nowMs: 0,
  user: buildTestUserIdentity({ uid: 501 }),
  homeDir: buildTestAbsolutePath({ text: '/Users/tester' }),
  homeRealPath: buildTestAbsolutePath({ text: '/Users/tester' }),
  tempDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/T' }),
  tempRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/T' }),
  userCacheDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/C' }),
  userCacheRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/C' }),
  applicationDirs: [buildTestAbsolutePath({ text: '/Applications' })],
  applicationRealPaths: [buildTestAbsolutePath({ text: '/Applications' })],
});

const CLOUD_DOCS = '/Users/tester/Library/Mobile Documents/com~apple~CloudDocs';

describeAwaitingWin32Platform('validateEvictRemoval', () => {
  test('approves an evict of files inside iCloud Drive', () => {
    const candidate = buildTestEvictCandidate({
      folderPath: `${CLOUD_DOCS}/Projects`,
      targets: [
        buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects/video.mov` }),
        buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects/deep/notes.pdf` }),
      ],
    });

    expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
      kind: 'approved',
      candidate: candidate,
    });
  });

  test('refuses an evict of a file outside iCloud Drive, at that file', () => {
    for (const outsidePath of [
      '/Users/tester/Downloads/video.mov',
      '/Users/tester/Library/Mobile DocumentsX/video.mov',
      '/etc/hosts',
    ]) {
      const candidate = buildTestEvictCandidate({
        folderPath: `${CLOUD_DOCS}/Projects`,
        targets: [
          buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects/video.mov` }),
          buildTestEvictTarget({ path: outsidePath }),
        ],
      });

      expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
        kind: 'refused',
        path: outsidePath,
        reason: 'outsideAllowedRoot',
      });
    }
  });

  test('refuses an evict of iCloud Drive itself, of a folder, and of a symbolic link', () => {
    const rootPath = '/Users/tester/Library/Mobile Documents';

    expect(
      validateRemoval({
        candidate: buildTestEvictCandidate({
          folderPath: rootPath,
          targets: [buildTestEvictTarget({ path: rootPath })],
        }),
        environment: ENVIRONMENT,
      }),
    ).toMatchObject({ reason: 'outsideAllowedRoot' });
    expect(
      validateRemoval({
        candidate: buildTestEvictCandidate({
          folderPath: CLOUD_DOCS,
          targets: [buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects`, kind: 'directory' })],
        }),
        environment: ENVIRONMENT,
      }),
    ).toMatchObject({ reason: 'unsupportedKind' });
    expect(
      validateRemoval({
        candidate: buildTestEvictCandidate({
          folderPath: CLOUD_DOCS,
          targets: [buildTestEvictTarget({ path: `${CLOUD_DOCS}/link`, kind: 'symbolicLink' })],
        }),
        environment: ENVIRONMENT,
      }),
    ).toMatchObject({ reason: 'symbolicLink' });
  });

  test('refuses a delete that is, holds, or lies in iCloud Drive', () => {
    for (const path of [
      '/Users/tester/Library/Mobile Documents',
      `${CLOUD_DOCS}/Projects/video.mov`,
      '/Users/tester/library/mobile documents/com~apple~clouddocs/video.mov',
      '/Users/tester/Library/Mobile Documents/iCloud~com~example~app/Documents',
    ]) {
      expect(
        validateRemoval({
          candidate: buildTestCandidate({ path: path, kind: 'file' }),
          environment: ENVIRONMENT,
        }),
      ).toEqual({ kind: 'refused', path: path, reason: 'protectedRoot' });
    }
  });

  test('approves a delete inside Mail Downloads, which lies outside Mail', () => {
    const path =
      '/Users/tester/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/ABC/invoice.pdf';

    expect(
      validateRemoval({
        candidate: buildTestCandidate({ path: path, kind: 'file' }),
        environment: ENVIRONMENT,
      }).kind,
    ).toBe('approved');
  });
});
