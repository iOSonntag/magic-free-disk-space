import { expect, test } from 'bun:test';
import { validateRemoval } from '../../src/delete/validateRemoval.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestEvictCandidate,
  buildTestEvictTarget,
} from '../support/evictCandidateFixtures.js';
import { buildTestMacEnvironment, TEST_MAC_HOME_DIR } from '../support/fixtureRoot.js';

const ENVIRONMENT = buildTestMacEnvironment();

const CLOUD_DOCS = `${TEST_MAC_HOME_DIR}/Library/Mobile Documents/com~apple~CloudDocs`;

describeAwaitingWin32Platform('validateRemoval of an evict', () => {
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
      `${TEST_MAC_HOME_DIR}/Downloads/video.mov`,
      `${TEST_MAC_HOME_DIR}/Library/Mobile DocumentsX/video.mov`,
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
    const rootPath = `${TEST_MAC_HOME_DIR}/Library/Mobile Documents`;

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

  test('refuses an evict of a file a protected folder holds, even inside a cloud folder', () => {
    const libraryPath = `${TEST_MAC_HOME_DIR}/Library`;
    const chatPath = `${libraryPath}/Messages/chat.db`;
    // No cloud folder of macOS holds a protected one, so this one is made up to hold Messages.
    const environment = { ...ENVIRONMENT, evictRealRoots: [libraryPath] };

    expect(
      validateRemoval({
        candidate: buildTestEvictCandidate({
          folderPath: libraryPath,
          targets: [
            buildTestEvictTarget({ path: `${libraryPath}/Logs/old.log` }),
            buildTestEvictTarget({ path: chatPath }),
          ],
        }),
        environment: environment,
      }),
    ).toEqual({ kind: 'refused', path: chatPath, reason: 'protectedRoot' });
  });
});
