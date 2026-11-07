import { expect, test } from 'bun:test';
import type { Risk } from '../../src/catalog/catalog.js';
import { validateRemoval } from '../../src/delete/validateRemoval.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestToolCandidate,
  buildTestUnitPathsCandidate,
} from '../support/candidateFixtures.js';
import { buildTestMacEnvironment, TEST_MAC_HOME_DIR } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

const ENVIRONMENT = buildTestMacEnvironment();

/** The path `relativePath` names below the test Mac's home. */
function buildHomePath(relativePath: string): string {
  return `${TEST_MAC_HOME_DIR}/${relativePath}`;
}

function validate(params: { path: string; risk?: Risk; kind?: FileKind }) {
  return validateRemoval({
    candidate: buildTestCandidate({
      path: params.path,
      risk: params.risk ?? 'safe',
      kind: params.kind ?? 'directory',
    }),
    environment: ENVIRONMENT,
  });
}

describeAwaitingWin32Platform('validateRemoval', () => {
  test('approves files and folders strictly inside an allowed root', () => {
    expect(validate({ path: buildHomePath('Library/Caches/com.example.app') }).kind).toBe(
      'approved',
    );
    expect(validate({ path: buildHomePath('Downloads/old.dmg'), kind: 'file' }).kind).toBe(
      'approved',
    );
    expect(validate({ path: '/private/var/folders/xy/abc/T/build-123' }).kind).toBe('approved');
    expect(validate({ path: '/Applications/Example.app', risk: 'review' }).kind).toBe('approved');
  });

  test('refuses an item marked never, whatever its path', () => {
    expect(validate({ path: '/Applications/Xcode.app', risk: 'never' })).toMatchObject({
      kind: 'refused',
      reason: 'neverRisk',
    });
  });

  test('refuses a symbolic link and anything that is neither file nor folder', () => {
    expect(validate({ path: buildHomePath('link'), kind: 'symbolicLink' })).toMatchObject({
      reason: 'symbolicLink',
    });
    expect(validate({ path: buildHomePath('socket'), kind: 'other' })).toMatchObject({
      reason: 'unsupportedKind',
    });
  });

  test('refuses every protected folder itself', () => {
    for (const protectedPath of ENVIRONMENT.protectedRealPaths) {
      expect(validate({ path: protectedPath })).toMatchObject({ reason: 'protectedRoot' });
    }
  });

  test('refuses keys, keychains, the deletion log, and the preferences, whole and in every part', () => {
    for (const relativePath of [
      '.ssh',
      '.ssh/id_ed25519',
      '.gnupg/private-keys-v1.d',
      'Library/Keychains/login.keychain-db',
      'Library/Logs/magic-free-disk-space',
      'Library/Logs/magic-free-disk-space/deletions.jsonl',
      'Library/Logs',
      'Library/Application Support/magic-free-disk-space',
      'Library/Application Support/magic-free-disk-space/preferences.json',
      'Library/Application Support',
    ]) {
      expect(validate({ path: buildHomePath(relativePath), kind: 'file' })).toMatchObject({
        reason: 'protectedRoot',
      });
    }

    expect(validate({ path: buildHomePath('Library/Logs/OtherApp') }).kind).toBe('approved');
    expect(validate({ path: buildHomePath('Library/Application Support/OtherApp') }).kind).toBe(
      'approved',
    );
  });

  test('refuses a protected folder written in another letter case', () => {
    expect(validate({ path: buildHomePath('library') })).toMatchObject({
      reason: 'protectedRoot',
    });
    expect(validate({ path: buildHomePath('LIBRARY/caches') })).toMatchObject({
      reason: 'protectedRoot',
    });
  });

  test('refuses a folder that holds a protected folder', () => {
    expect(validate({ path: '/Users' })).toMatchObject({ reason: 'protectedRoot' });
    expect(validate({ path: '/private/var/folders/xy' })).toMatchObject({
      reason: 'protectedRoot',
    });
  });

  test('refuses paths outside every allowed root', () => {
    expect(validate({ path: '/etc/hosts', kind: 'file' })).toMatchObject({
      reason: 'outsideAllowedRoot',
    });
    expect(validate({ path: `${TEST_MAC_HOME_DIR}X/Library` })).toMatchObject({
      reason: 'outsideAllowedRoot',
    });
    expect(validate({ path: '/Applications' })).toMatchObject({ reason: 'outsideAllowedRoot' });
    expect(validate({ path: buildHomePath('Library/Caches/x').slice(1) })).toMatchObject({
      reason: 'outsideAllowedRoot',
    });
  });

  test('approves the children of a protected folder', () => {
    expect(validate({ path: buildHomePath('.Trash/old-photo.jpg'), kind: 'file' }).kind).toBe(
      'approved',
    );
    expect(validate({ path: buildHomePath('Library/Containers/com.example.gone') }).kind).toBe(
      'approved',
    );
  });

  test('approves a tool item of any other risk, and refuses one marked never', () => {
    for (const risk of ['safe', 'careful', 'review'] as const) {
      const candidate = buildTestToolCandidate({
        homeDir: TEST_MAC_HOME_DIR,
        version: '20.1.0',
        risk: risk,
      });

      expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
        kind: 'approved',
        candidate: candidate,
      });
    }

    const neverCandidate = buildTestToolCandidate({
      homeDir: TEST_MAC_HOME_DIR,
      version: '20.1.0',
      risk: 'never',
    });

    expect(validateRemoval({ candidate: neverCandidate, environment: ENVIRONMENT })).toEqual({
      kind: 'refused',
      path: neverCandidate.path,
      reason: 'neverRisk',
    });
  });

  test('judges each target of a unit, and refuses the item at the first target refused', () => {
    const repoPath = buildHomePath('.cache/huggingface/hub');
    const allowedPath = `${repoPath}/models--example--model/blobs/a`;
    const buildUnitCandidate = (targetPaths: [string, ...string[]]) =>
      buildTestUnitPathsCandidate({
        probe: 'huggingFaceRepos',
        unit: {
          kind: 'huggingFaceRepository',
          repoPath: buildTestAbsolutePath({ text: repoPath }),
          downloadedAtMs: null,
          foundPaths: [buildTestAbsolutePath({ text: allowedPath })],
        },
        path: `${repoPath}/models--example--model`,
        targetPaths: targetPaths,
      });
    const allowed = buildUnitCandidate([allowedPath, `${allowedPath}-other`]);

    expect(validateRemoval({ candidate: allowed, environment: ENVIRONMENT })).toEqual({
      kind: 'approved',
      candidate: allowed,
    });
    expect(
      validateRemoval({
        candidate: buildUnitCandidate([allowedPath, buildHomePath('.ssh'), '/etc/hosts']),
        environment: ENVIRONMENT,
      }),
    ).toEqual({ kind: 'refused', path: buildHomePath('.ssh'), reason: 'protectedRoot' });
  });

  test('approves an engine item, since its engine removes it after a recheck', () => {
    const candidate = buildTestEngineCandidate({ homeDir: TEST_MAC_HOME_DIR });

    expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
      kind: 'approved',
      candidate: candidate,
    });
  });
});
