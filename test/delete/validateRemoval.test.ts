import { describe, expect, test } from 'bun:test';
import type { Risk } from '../../src/catalog/catalog.js';
import { validateRemoval } from '../../src/delete/validateRemoval.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { CandidateProbed, CandidateRecycleBin } from '../../src/scan/candidate.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import {
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestToolCandidate,
  buildTestUnitPathsCandidate,
} from '../support/candidateFixtures.js';
import { EXAMPLE_WIN32_ENVIRONMENT } from '../support/environmentFixtures.js';
import { buildTestMacEnvironment, TEST_MAC_HOME_DIR } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const ENVIRONMENT = buildTestMacEnvironment();

/** The path `relativePath` names below the test Mac's home. */
function buildHomePath(relativePath: string): string {
  return `${TEST_MAC_HOME_DIR}/${relativePath}`;
}

function validate(params: {
  path: string;
  risk?: Risk;
  kind?: FileKind;
  environment?: Environment;
}) {
  return validateRemoval({
    candidate: buildTestCandidate({
      path: params.path,
      risk: params.risk ?? 'safe',
      kind: params.kind ?? 'directory',
    }),
    environment: params.environment ?? ENVIRONMENT,
  });
}

/** The decision on `path` in the example environment of Windows. */
function validateOnWindows(params: { path: string; kind?: FileKind }) {
  return validate({ ...params, environment: EXAMPLE_WIN32_ENVIRONMENT });
}

/** The Recycle Bin of the drive at `driveRootText`, as the scan offers it. */
function buildRecycleBinCandidate(params: {
  driveRootText: string;
  risk?: Risk;
}): CandidateRecycleBin {
  return {
    ...buildTestCandidate({
      path: `${params.driveRootText}$Recycle.Bin`,
      title: 'Recycle Bin',
      category: 'trash',
      risk: params.risk ?? 'careful',
      allocatedBytes: 4096,
      entryCount: 2,
    }),
    origin: { kind: 'recycleBin' },
    removal: {
      kind: 'emptyRecycleBin',
      driveRootPath: buildTestWindowsPath({ text: params.driveRootText }),
      scannedContent: { sizeBytes: 4096, itemCount: 2 },
    },
  };
}

describe('validateRemoval on Windows', () => {
  test('approves an entry below the profile or an AppData folder, in any case', () => {
    for (const path of [
      'c:\\users\\TESTER\\appdata\\local\\Example\\Cache',
      'C:\\Users\\tester\\AppData\\Roaming\\Example\\logs',
      'C:\\Users\\tester\\Downloads\\old.zip',
      'C:\\Users\\tester\\AppData\\Local\\Temp\\build-123',
    ]) {
      expect(validateOnWindows({ path: path }).kind).toBe('approved');
    }
  });

  test('refuses every protected folder itself, each fixed drive root among them', () => {
    for (const protectedPath of EXAMPLE_WIN32_ENVIRONMENT.protectedRealPaths) {
      expect(validateOnWindows({ path: protectedPath })).toMatchObject({ reason: 'protectedRoot' });
    }
  });

  test('refuses the deletion log and the preferences in any case, whole and in every part', () => {
    for (const path of [
      'C:\\USERS\\tester\\AppData\\Local\\magic-free-disk-space\\Logs\\deletions.jsonl',
      'c:\\users\\tester\\appdata\\local\\MAGIC-FREE-DISK-SPACE',
      'C:\\Users\\tester\\AppData\\Local\\magic-free-disk-space\\preferences.json',
    ]) {
      expect(validateOnWindows({ path: path, kind: 'file' })).toMatchObject({
        reason: 'protectedRoot',
      });
    }
  });

  test('approves the Recycle Bin of a fixed drive the environment lists, and no other', () => {
    for (const driveRootText of ['C:\\', 'D:\\']) {
      const candidate = buildRecycleBinCandidate({ driveRootText: driveRootText });

      expect(
        validateRemoval({ candidate: candidate, environment: EXAMPLE_WIN32_ENVIRONMENT }),
      ).toEqual({ kind: 'approved', candidate: candidate });
    }

    expect(
      validateRemoval({
        candidate: buildRecycleBinCandidate({ driveRootText: 'E:\\' }),
        environment: EXAMPLE_WIN32_ENVIRONMENT,
      }),
    ).toEqual({ kind: 'refused', path: 'E:\\', reason: 'outsideAllowedRoot' });
    expect(
      validateRemoval({
        candidate: buildRecycleBinCandidate({ driveRootText: 'C:\\' }),
        environment: ENVIRONMENT,
      }),
    ).toMatchObject({ kind: 'refused', reason: 'outsideAllowedRoot' });
  });

  test('refuses a Recycle Bin marked never', () => {
    expect(
      validateRemoval({
        candidate: buildRecycleBinCandidate({ driveRootText: 'C:\\', risk: 'never' }),
        environment: EXAMPLE_WIN32_ENVIRONMENT,
      }),
    ).toMatchObject({ kind: 'refused', reason: 'neverRisk' });
  });

  test('refuses a path on another drive and one that names no drive', () => {
    for (const path of ['D:\\Data\\old.zip', '\\\\server\\share\\x', 'C:Users\\tester\\x']) {
      expect(validateOnWindows({ path: path, kind: 'file' })).toMatchObject({
        reason: 'outsideAllowedRoot',
      });
    }
  });
});

describe('validateRemoval', () => {
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

  test('approves no path whose case differs from its allowed root, which macOS compares exactly', () => {
    expect(validate({ path: '/users/tester/Downloads/old.dmg', kind: 'file' })).toMatchObject({
      reason: 'outsideAllowedRoot',
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
        home: ENVIRONMENT,
        version: '20.1.0',
        risk: risk,
      });

      expect(validateRemoval({ candidate: candidate, environment: ENVIRONMENT })).toEqual({
        kind: 'approved',
        candidate: candidate,
      });
    }

    const neverCandidate = buildTestToolCandidate({
      home: ENVIRONMENT,
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
    function buildUnitCandidate(targetPaths: [string, ...string[]]): CandidateProbed {
      return buildTestUnitPathsCandidate({
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
    }

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
