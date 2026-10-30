import { describe, expect, test } from 'bun:test';
import type { Risk } from '../../src/catalog/catalog.js';
import { validateRemoval } from '../../src/delete/validateRemoval.js';
import { buildEnvironment } from '../../src/environment/buildEnvironment.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

const ENVIRONMENT = buildEnvironment({
  platform: 'darwin',
  nowMs: 0,
  userId: 501,
  homeDir: buildTestAbsolutePath({ text: '/Users/tester' }),
  homeRealPath: '/Users/tester',
  tempDir: '/var/folders/xy/abc/T',
  tempRealPath: '/private/var/folders/xy/abc/T',
  applicationDirs: ['/Applications'],
  applicationRealPaths: ['/Applications'],
});

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

describe('validateRemoval', () => {
  test('approves files and folders strictly inside an allowed root', () => {
    expect(validate({ path: '/Users/tester/Library/Caches/com.example.app' }).kind).toBe(
      'approved',
    );
    expect(validate({ path: '/Users/tester/Downloads/old.dmg', kind: 'file' }).kind).toBe(
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
    expect(validate({ path: '/Users/tester/link', kind: 'symbolicLink' })).toMatchObject({
      reason: 'symbolicLink',
    });
    expect(validate({ path: '/Users/tester/socket', kind: 'other' })).toMatchObject({
      reason: 'unsupportedKind',
    });
  });

  test('refuses every protected folder itself', () => {
    for (const protectedPath of ENVIRONMENT.protectedRealPaths) {
      expect(validate({ path: protectedPath })).toMatchObject({ reason: 'protectedRoot' });
    }
  });

  test('refuses keys, keychains, and the deletion log, whole and in every part', () => {
    for (const path of [
      '/Users/tester/.ssh',
      '/Users/tester/.ssh/id_ed25519',
      '/Users/tester/.gnupg/private-keys-v1.d',
      '/Users/tester/Library/Keychains/login.keychain-db',
      '/Users/tester/Library/Logs/magic-free-disk-space',
      '/Users/tester/Library/Logs/magic-free-disk-space/deletions.jsonl',
      '/Users/tester/Library/Logs',
    ]) {
      expect(validate({ path: path, kind: 'file' })).toMatchObject({ reason: 'protectedRoot' });
    }

    expect(validate({ path: '/Users/tester/Library/Logs/OtherApp' }).kind).toBe('approved');
  });

  test('refuses a protected folder written in another letter case', () => {
    expect(validate({ path: '/Users/tester/library' })).toMatchObject({ reason: 'protectedRoot' });
    expect(validate({ path: '/Users/tester/LIBRARY/caches' })).toMatchObject({
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
    expect(validate({ path: '/Users/testerX/Library' })).toMatchObject({
      reason: 'outsideAllowedRoot',
    });
    expect(validate({ path: '/Applications' })).toMatchObject({ reason: 'outsideAllowedRoot' });
    expect(validate({ path: 'Users/tester/Library/Caches/x' })).toMatchObject({
      reason: 'outsideAllowedRoot',
    });
  });

  test('approves the children of a protected folder', () => {
    expect(validate({ path: '/Users/tester/.Trash/old-photo.jpg', kind: 'file' }).kind).toBe(
      'approved',
    );
    expect(validate({ path: '/Users/tester/Library/Containers/com.example.gone' }).kind).toBe(
      'approved',
    );
  });

  test('approves a tool item of any other risk, and refuses one marked never', () => {
    for (const risk of ['safe', 'careful', 'review'] as const) {
      const candidate = buildTestToolCandidate({
        homeDir: '/Users/tester',
        version: '20.1.0',
        risk: risk,
      });

      expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
        kind: 'approved',
        candidate: candidate,
      });
    }

    const neverCandidate = buildTestToolCandidate({
      homeDir: '/Users/tester',
      version: '20.1.0',
      risk: 'never',
    });

    expect(validateRemoval({ candidate: neverCandidate, environment: ENVIRONMENT })).toEqual({
      kind: 'refused',
      path: neverCandidate.path,
      reason: 'neverRisk',
    });
  });
});
