import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { buildGuidBytes, KNOWN_FOLDER_IDS } from '../../src/platform/win32/knownFolderIds.js';
import { listDriveRootTexts } from '../../src/platform/win32/listDriveRoots.js';
import type { Win32CallFailure } from '../../src/platform/win32/win32Api.js';
import {
  closeHandle,
  loadDriveType,
  loadFileAttributes,
  loadFileOwnerSid,
  loadKnownFolderPath,
  loadLogicalDrives,
  loadTokenElevation,
  loadTokenUserSid,
  openProcessToken,
} from '../../src/platform/win32/win32Api.js';
import type { Result } from '../../src/result.js';
import { formatSystemCallFailure } from '../../src/system/systemCallFailure.js';
import { parseWindowsSid } from '../../src/system/userIdentity.js';
import { runChildProcess } from '../support/fixtureCommand.js';
import { buildTestHostPath } from '../support/parsedValueFixtures.js';
import {
  FILE_ATTRIBUTE_DIRECTORY,
  FILE_ATTRIBUTE_READONLY,
  FILE_ATTRIBUTE_REPARSE_POINT,
} from '../support/windowsFileAttributes.js';
import { buildLongPathSegments } from './longPath.js';
import { parseProbeLines } from './observations.js';

// Asserts what the code relies on of Bun and of the calls of win32Api.ts on Windows. The workflow
// runs it on x64 and arm64, and once more with long paths off.

const FIXTURES_FOLDER = join(import.meta.dir, 'fixtures');
const CLOUD_PLACEHOLDER_PROBE_PATH = join(FIXTURES_FOLDER, 'cloudPlaceholderProbe.ts');
const COMPILED_PROBE_ENTRY_PATH = join(FIXTURES_FOLDER, 'compiledProbe.ts');
const FILE_SYSTEM_TEST_TIMEOUT_MS = 60_000;
const CHILD_TIMEOUT_MS = 60_000;
const COMPILED_PROBE_TIMEOUT_MS = 120_000;
const COMPILED_PROBE_TEST_TIMEOUT_MS = 300_000;
const ECHO_LINE = 'Größe – 🧹';

/**
 * Set to `1` to run the cloud placeholder probe, which registers a sync root of the Cloud Files
 * API on this machine for the time of the probe; the Windows runners of the tests set it.
 */
const isCloudProbeOptedIn = process.env.MAGIC_FREE_DISK_SPACE_CLOUD_PROBE === '1';

/** The longest path a W function takes without its `\\?\` form while long paths are off. */
const MAX_PATH = 260;

const ERROR_FILE_NOT_FOUND = 2;
const DRIVE_FIXED = 3;

/** `GUID_NULL`, the id of no known folder. */
const NO_KNOWN_FOLDER_ID = '00000000-0000-0000-0000-000000000000';

/** An attribute text of loadAttributesText: the call succeeded. */
const attributesHexPattern = /^0x[0-9A-F]{8}$/;

// The flags the release compiles the bridge with, so the probe runs as the bridge does.
const COMPILED_PROBE_BUILD_FLAGS = [
  '--compile',
  '--windows-hide-console',
  '--windows-title',
  'Magic Free Disk Space',
  '--windows-publisher',
  'iOSonntag',
  '--windows-version',
  '0.0.0.0',
  '--windows-description',
  'Magic Free Disk Space bridge',
  '--windows-copyright',
  'Copyright © 2026 iOSonntag. MIT License.',
] as const;

/** The known folders the environment takes from Windows, by the variable that names each. */
const knownFolderVariables = [
  { folder: 'profile', variableName: 'USERPROFILE' },
  { folder: 'localAppData', variableName: 'LOCALAPPDATA' },
  { folder: 'roamingAppData', variableName: 'APPDATA' },
] as const;

/** The value of a call that succeeded; throws with the call and its code for one that failed. */
function unwrapCall<TValue>(result: Result<TValue, Win32CallFailure>): TValue {
  if (result.kind === 'failed') {
    throw new Error(`${formatSystemCallFailure({ failure: result.failure })}.`);
  }

  return result.value;
}

/** The attributes win32Api.ts reads for the host path. */
function loadAttributes(path: string): number {
  return unwrapCall(loadFileAttributes({ path: buildTestHostPath({ text: path }) }));
}

describe.skipIf(process.platform !== 'win32')('Bun and win32Api.ts on Windows', () => {
  let folder: string;

  beforeEach(async () => {
    // Below the real temp folder, so no path holds a short name such as RUNNER~1.
    folder = await mkdtemp(join(await realpath(tmpdir()), 'mfds-windows-facts-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  test(
    'lstat reads a junction and a directory symlink as links, GetFileAttributesW as reparse points',
    async () => {
      const target = join(folder, 'target');
      const junction = join(folder, 'junction');
      const directorySymlink = join(folder, 'directorySymlink');

      await mkdir(target);
      await symlink(target, junction, 'junction');
      await symlink(target, directorySymlink, 'dir');

      for (const link of [junction, directorySymlink]) {
        expect((await lstat(link)).isSymbolicLink()).toBe(true);
        expect(loadAttributes(link) & FILE_ATTRIBUTE_REPARSE_POINT).toBe(
          FILE_ATTRIBUTE_REPARSE_POINT,
        );
      }

      expect((await lstat(target)).isDirectory()).toBe(true);
      expect(loadAttributes(target) & FILE_ATTRIBUTE_REPARSE_POINT).toBe(0);
    },
    FILE_SYSTEM_TEST_TIMEOUT_MS,
  );

  test('GetFileAttributesW fails for a missing path with the GetLastError of the call', () => {
    expect(
      loadFileAttributes({ path: buildTestHostPath({ text: join(folder, 'missing') }) }),
    ).toEqual({
      kind: 'failed',
      failure: { call: 'GetFileAttributesW', code: ERROR_FILE_NOT_FOUND },
    });
    expect(loadAttributes(folder) & FILE_ATTRIBUTE_DIRECTORY).toBe(FILE_ATTRIBUTE_DIRECTORY);
  });

  test(
    'Bun fs and win32Api.ts reach a path past 260 characters, with long paths on or off',
    async () => {
      const longFolder = join(folder, ...buildLongPathSegments());
      const longFile = join(longFolder, 'file.txt');

      expect(longFile.length).toBeGreaterThan(MAX_PATH);

      await mkdir(longFolder, { recursive: true });
      await writeFile(longFile, 'long path');

      expect((await lstat(longFile)).isFile()).toBe(true);
      expect(await readdir(longFolder)).toEqual(['file.txt']);
      expect(loadAttributes(longFolder) & FILE_ATTRIBUTE_DIRECTORY).toBe(FILE_ATTRIBUTE_DIRECTORY);
      expect(loadAttributes(longFile) & FILE_ATTRIBUTE_DIRECTORY).toBe(0);

      const ownerSid = unwrapCall(
        loadFileOwnerSid({ path: buildTestHostPath({ text: longFile }) }),
      );

      expect(parseWindowsSid({ text: ownerSid }).kind).toBe('succeeded');

      await rm(longFolder, { recursive: true });

      expect(existsSync(longFolder)).toBe(false);
    },
    FILE_SYSTEM_TEST_TIMEOUT_MS,
  );

  test(
    'rm of a tree removes its read-only file and leaves the target of a junction in it',
    async () => {
      for (const force of [false, true]) {
        const tree = join(folder, `force-${force}`, 'tree');
        const outside = join(folder, `force-${force}`, 'outside');
        const sentinel = join(outside, 'sentinel.txt');
        const readOnlyFile = join(tree, 'readOnly.txt');

        await mkdir(outside, { recursive: true });
        await writeFile(sentinel, 'sentinel');
        await mkdir(tree, { recursive: true });
        await writeFile(readOnlyFile, 'read only');
        await chmod(readOnlyFile, 0o444);
        await symlink(outside, join(tree, 'junctionOutside'), 'junction');

        expect(loadAttributes(readOnlyFile) & FILE_ATTRIBUTE_READONLY).toBe(
          FILE_ATTRIBUTE_READONLY,
        );

        await rm(tree, { recursive: true, force: force });

        expect(existsSync(tree)).toBe(false);
        expect(await readFile(sentinel, 'utf8')).toBe('sentinel');
      }
    },
    FILE_SYSTEM_TEST_TIMEOUT_MS,
  );

  test('Bun has no POSIX user ids on Windows', () => {
    expect(process.geteuid).toBeUndefined();
    expect(process.getuid).toBeUndefined();
  });

  test('the token of the process names its user by a SID and reads its elevation', () => {
    const token = unwrapCall(openProcessToken());

    try {
      const sidText = unwrapCall(loadTokenUserSid({ token: token }));

      expect(parseWindowsSid({ text: sidText }).kind).toBe('succeeded');
      expect(typeof unwrapCall(loadTokenElevation({ token: token }))).toBe('boolean');
    } finally {
      closeHandle({ handle: token });
    }
  });

  test('the SID of the token reads the same while the collector runs between the reads', () => {
    const token = unwrapCall(openProcessToken());

    try {
      const sidTexts = Array.from({ length: 200 }, () => {
        Bun.gc(true);

        return unwrapCall(loadTokenUserSid({ token: token }));
      });

      expect(new Set(sidTexts).size).toBe(1);
      expect(parseWindowsSid({ text: sidTexts[0] ?? '' }).kind).toBe('succeeded');
    } finally {
      closeHandle({ handle: token });
    }
  });

  test('the profile and the AppData folders are the folders their variables name', () => {
    for (const knownFolder of knownFolderVariables) {
      const pathText = unwrapCall(
        loadKnownFolderPath({
          folderId: buildGuidBytes({ text: KNOWN_FOLDER_IDS[knownFolder.folder] }),
        }),
      );

      expect(buildTestHostPath({ text: pathText })).toBe(
        buildTestHostPath({ text: process.env[knownFolder.variableName] ?? '' }),
      );
    }
  });

  test('SHGetKnownFolderPath fails for an id that names no known folder', () => {
    expect(
      loadKnownFolderPath({ folderId: buildGuidBytes({ text: NO_KNOWN_FOLDER_ID }) }),
    ).toMatchObject({ kind: 'failed', failure: { call: 'SHGetKnownFolderPath' } });
  });

  test('the drives in use hold the drive of the profile, a fixed one', () => {
    const profile = unwrapCall(
      loadKnownFolderPath({ folderId: buildGuidBytes({ text: KNOWN_FOLDER_IDS.profile }) }),
    );
    const profileRootText = parse(buildTestHostPath({ text: profile })).root;
    const driveRootTexts = listDriveRootTexts({ logicalDrives: unwrapCall(loadLogicalDrives()) });

    expect(driveRootTexts).toContain(profileRootText);
    expect(loadDriveType({ rootPath: buildTestHostPath({ text: profileRootText }) })).toBe(
      DRIVE_FIXED,
    );
  });

  test(
    'a probe compiled with the flags of the bridge echoes stdin byte-exact, ends with it, and reaches a long path through win32Api.ts',
    async () => {
      const executablePath = join(folder, 'compiledProbe.exe');
      const build = await runChildProcess({
        command: [
          process.execPath,
          'build',
          ...COMPILED_PROBE_BUILD_FLAGS,
          COMPILED_PROBE_ENTRY_PATH,
          '--outfile',
          executablePath,
        ],
        stdin: null,
        timeoutMs: COMPILED_PROBE_TIMEOUT_MS,
      });

      expect(build).toMatchObject({ exitCode: 0, timedOut: false });

      const input = new TextEncoder().encode(`1 ${ECHO_LINE}\n2 ${ECHO_LINE}\n`);
      const probeRun = await runChildProcess({
        command: [executablePath, folder],
        stdin: input,
        timeoutMs: COMPILED_PROBE_TIMEOUT_MS,
      });

      expect(probeRun).toMatchObject({ exitCode: 0, timedOut: false });
      expect(Buffer.from(probeRun.stdout.subarray(0, input.byteLength))).toEqual(
        Buffer.from(input),
      );
      expect(
        parseProbeLines(new TextDecoder().decode(probeRun.stdout.subarray(input.byteLength))),
      ).toEqual([
        { finding: 'stdin', echoedLineCount: 2 },
        {
          finding: 'long path in the compiled probe',
          mkdir: 'ok',
          writeFile: 'ok',
          lstat: 'ok isFile=true',
          attributes: expect.stringMatching(attributesHexPattern),
          rm: 'ok',
        },
      ]);
    },
    COMPILED_PROBE_TEST_TIMEOUT_MS,
  );

  test.skipIf(!isCloudProbeOptedIn)(
    'a cloud-only file of the Cloud Files API reads as evicted, a populated folder and a hydrated file as on this PC',
    async () => {
      const syncRoot = join(folder, 'syncRoot');

      await mkdir(syncRoot);

      const run = await runChildProcess({
        command: [process.execPath, CLOUD_PLACEHOLDER_PROBE_PATH, syncRoot],
        stdin: null,
        timeoutMs: CHILD_TIMEOUT_MS,
      });

      expect(run).toMatchObject({ exitCode: 0, timedOut: false });

      const stages = parseProbeLines(new TextDecoder().decode(run.stdout));

      expect(stages).toContainEqual(
        expect.objectContaining({
          stage: 'cloud-only file',
          placement: { kind: 'cloudOnly' },
          lstat: 'isSymbolicLink=false isDirectory=false isFile=true',
        }),
      );
      expect(stages).toContainEqual(
        expect.objectContaining({ stage: 'cloud-only folder', placement: { kind: 'onDisk' } }),
      );
      expect(stages).toContainEqual(
        expect.objectContaining({ stage: 'hydrated file', placement: { kind: 'onDisk' } }),
      );
    },
    CHILD_TIMEOUT_MS * 2,
  );
});
