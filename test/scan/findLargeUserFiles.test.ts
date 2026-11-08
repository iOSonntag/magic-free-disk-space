import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ARTIFACT_RULES } from '../../src/catalog/projectArtifactRules.js';
import type { PathRules } from '../../src/path/pathRules.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { UserFileFinding } from '../../src/scan/findLargeUserFiles.js';
import { findLargeUserFiles } from '../../src/scan/findLargeUserFiles.js';
import type { ScanIssue } from '../../src/scan/issue.js';
import type { EntryReads, EntryRef } from '../../src/system/entryReads.js';
import type { EvictedEntryRecorder } from '../../src/system/walkDirectoryTree.js';
import { buildTestEntryReads, loadEntryAllocatedBytes } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import { hostPathRules } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

const MIN_ALLOCATED_BYTES = 1024 * 1024;
const LARGE_FILE_BYTES = 2 * 1024 * 1024;
const SMALL_FILE_BYTES = 1024;
const TEST_MODIFIED_MS = 1_600_000_000_000;
const FAR_FUTURE_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

async function findFiles(params: {
  pathRules?: PathRules;
  rootDirs: string[];
  deadlineMs?: number;
  entryReads?: EntryReads;
  recordEvictedEntry?: EvictedEntryRecorder;
}): Promise<{ findings: UserFileFinding[]; issues: ScanIssue[] }> {
  return findLargeUserFiles({
    pathRules: params.pathRules ?? hostPathRules,
    rootDirs: params.rootDirs,
    artifactRules: PROJECT_ARTIFACT_RULES,
    minAllocatedBytes: MIN_ALLOCATED_BYTES,
    deadlineMs: params.deadlineMs ?? FAR_FUTURE_DEADLINE_MS,
    entryReads: params.entryReads ?? hostPlatform.system.entryReads,
    recordEvictedEntry: params.recordEvictedEntry ?? null,
    privacyDenialCode: hostPlatform.system.privacyDenialCode,
  });
}

describe('findLargeUserFiles', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot });
  });

  test('finds large files at any depth and skips small ones', async () => {
    const largePath = join(fixtureRoot.homeDir, 'large.bin');
    const nestedDir = join(fixtureRoot.homeDir, 'Downloads/archive');
    const nestedPath = join(nestedDir, 'nested.zip');
    await createFixtureDirectory({ path: nestedDir });
    await createFixtureFile({
      path: largePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await createFixtureFile({
      path: nestedPath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'small.txt'),
      sizeBytes: SMALL_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result.issues).toEqual([]);
    expect(result.findings.map((finding) => finding.path).toSorted()).toEqual(
      [largePath, nestedPath].toSorted(),
    );
  });

  test('a finding carries its identity, size, and modified time', async () => {
    const largePath = join(fixtureRoot.homeDir, 'large.bin');
    await createFixtureFile({
      path: largePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    const [finding] = result.findings;

    expect(result.findings).toHaveLength(1);
    expect(finding?.path).toBe(largePath);
    expect(finding?.identity.kind).toBe('file');
    expect(finding?.allocatedBytes).toBeGreaterThanOrEqual(LARGE_FILE_BYTES);
    expect(finding?.modifiedMs).toBe(TEST_MODIFIED_MS);
  });

  test('files of a git working tree, a hidden folder, or a framework are not found', async () => {
    const hiddenPaths = [
      'Documents/sdk/.git/objects/pack.bin',
      'Documents/sdk/bin/cache/engine.bin',
      'Documents/.tool/blob.bin',
      'Documents/Kit.framework/Versions/A/Kit',
      'Documents/Effects.vst3/Contents/effect.bin',
    ];
    const loosePath = join(fixtureRoot.homeDir, 'Documents/recording.mov');

    for (const relativePath of hiddenPaths) {
      await createFixtureFile({
        path: join(fixtureRoot.homeDir, relativePath),
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    await createFixtureFile({
      path: loosePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [join(fixtureRoot.homeDir, 'Documents')] });

    expect(result.findings.map((finding) => finding.path)).toEqual([loosePath]);
  });

  test('an artifact folder is skipped beside its marker and searched without it', async () => {
    const markedPath = join(fixtureRoot.homeDir, 'Documents/app/build/outputs/app.apk');
    const unmarkedPath = join(fixtureRoot.homeDir, 'Documents/clips/build/final.mov');

    for (const path of [markedPath, unmarkedPath]) {
      await createFixtureFile({
        path: path,
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'Documents/app/build.gradle'),
      sizeBytes: SMALL_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [join(fixtureRoot.homeDir, 'Documents')] });

    expect(result.findings.map((finding) => finding.path)).toEqual([unmarkedPath]);
  });

  test('an artifact folder and its marker in another case are skipped under the rules of Windows, and searched under those of POSIX', async () => {
    const artifactFilePath = join(fixtureRoot.homeDir, 'Documents/app/Build/outputs/app.apk');
    await createFixtureFile({
      path: artifactFilePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'Documents/app/BUILD.GRADLE'),
      sizeBytes: SMALL_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    const rootDirs = [join(fixtureRoot.homeDir, 'Documents')];

    const win32Result = await findFiles({ pathRules: WIN32_PATH_RULES, rootDirs: rootDirs });
    const posixResult = await findFiles({ pathRules: POSIX_PATH_RULES, rootDirs: rootDirs });

    expect(win32Result.findings).toEqual([]);
    expect(posixResult.findings.map((finding) => finding.path)).toEqual([artifactFilePath]);
  });

  test('a folder or file the entry reads call a link is not searched or found, and a root file they call one has the kind of a link', async () => {
    // As a mounted folder or another reparse point on Windows, which lstat calls a folder or a
    // file. The decision skips a finding of a link.
    const mountedDir = join(fixtureRoot.homeDir, 'Documents/mounted');
    const insidePath = join(mountedDir, 'inside.bin');
    const reparseFilePath = join(fixtureRoot.homeDir, 'Documents/reparse.bin');
    const plainPath = join(fixtureRoot.homeDir, 'Documents/plain.bin');

    for (const path of [insidePath, reparseFilePath, plainPath]) {
      await createFixtureFile({
        path: path,
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    const result = await findFiles({
      rootDirs: [join(fixtureRoot.homeDir, 'Documents'), reparseFilePath],
      entryReads: buildTestEntryReads({
        privateBytes: LARGE_FILE_BYTES,
        linkPaths: [mountedDir, reparseFilePath],
      }),
    });

    expect(result.issues).toEqual([]);
    expect(
      result.findings.map((finding) => ({ path: finding.path, kind: finding.identity.kind })),
    ).toEqual([
      { path: plainPath, kind: 'file' },
      { path: reparseFilePath, kind: 'symbolicLink' },
    ]);
  });

  test('records each entry its walk leaves unread in the cloud', async () => {
    const cloudDir = join(fixtureRoot.homeDir, 'Documents/cloud');
    await createFixtureFile({
      path: join(cloudDir, 'clip.mov'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    const recordedEntries: EntryRef[] = [];

    const result = await findFiles({
      rootDirs: [join(fixtureRoot.homeDir, 'Documents')],
      entryReads: buildTestEntryReads({
        privateBytes: LARGE_FILE_BYTES,
        cloudOnlyPaths: [cloudDir],
      }),
      recordEvictedEntry: (entry) => {
        recordedEntries.push(entry);
      },
    });

    expect(result.findings).toEqual([]);
    expect(recordedEntries).toEqual([{ path: cloudDir, kind: 'directory' }]);
  });

  test('a file inside a package folder is not found', async () => {
    const originalsDir = join(fixtureRoot.homeDir, 'Pictures/Photos.photoslibrary/originals');
    await createFixtureDirectory({ path: originalsDir });
    await createFixtureFile({
      path: join(originalsDir, 'large.jpg'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a package folder name matches its suffix case-insensitively', async () => {
    const bundleContentsDir = join(fixtureRoot.homeDir, 'Tools.APP/Contents');
    await createFixtureDirectory({ path: bundleContentsDir });
    await createFixtureFile({
      path: join(bundleContentsDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a file inside any folder named with an extension is not found', async () => {
    const packagedPaths = [
      'Movies/iMovie Library.imovielibrary/2019-05-01/Original Media/clip.mov',
      'Documents/Virtual Machines.localized/Windows.vmwarevm/disk-s001.vmdk',
      'Documents/Parallels/Windows 11.pvm/harddisk.hdd/harddisk.hds',
      'Documents/Linux.utm/Data/disk.qcow2',
    ];

    for (const relativePath of packagedPaths) {
      await createFixtureFile({
        path: join(fixtureRoot.homeDir, relativePath),
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    const result = await findFiles({
      rootDirs: [join(fixtureRoot.homeDir, 'Movies'), join(fixtureRoot.homeDir, 'Documents')],
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a localized folder and a folder named with a version number are searched', async () => {
    const localizedPath = join(fixtureRoot.homeDir, 'Documents/Old Exports.localized/export.mov');
    const versionPath = join(fixtureRoot.homeDir, 'Documents/Release 2.0/installer.dmg');

    for (const path of [localizedPath, versionPath]) {
      await createFixtureFile({
        path: path,
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    const result = await findFiles({ rootDirs: [join(fixtureRoot.homeDir, 'Documents')] });

    expect(result.findings.map((finding) => finding.path)).toEqual([localizedPath, versionPath]);
  });

  testOnPosix('a symbolic link to a large file is not followed', async () => {
    const outsideDir = join(fixtureRoot.rootDir, 'outside');
    await createFixtureDirectory({ path: outsideDir });
    await createFixtureFile({
      path: join(outsideDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await symlink(join(outsideDir, 'large.bin'), join(fixtureRoot.homeDir, 'link.bin'));

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  testOnPosix('a root that is a symbolic link is not walked', async () => {
    const outsideDir = join(fixtureRoot.rootDir, 'outside');
    await createFixtureDirectory({ path: outsideDir });
    await createFixtureFile({
      path: join(outsideDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    const linkedRootDir = join(fixtureRoot.rootDir, 'linked-root');
    await symlink(outsideDir, linkedRootDir);

    const result = await findFiles({ rootDirs: [linkedRootDir] });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a hard-linked large file is not found, since deleting one link frees nothing', async () => {
    const firstPath = join(fixtureRoot.homeDir, 'first.bin');
    await createFixtureFile({
      path: firstPath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await link(firstPath, join(fixtureRoot.homeDir, 'second.bin'));

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a large file whose private size stays below the minimum is not found', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'mostly-shared.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({
      rootDirs: [fixtureRoot.homeDir],
      entryReads: buildTestEntryReads({ privateBytes: SMALL_FILE_BYTES }),
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a finding counts its private size, or its blocks and the fallback when unread', async () => {
    const largePath = join(fixtureRoot.homeDir, 'large.bin');
    await createFixtureFile({
      path: largePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const read = await findFiles({
      rootDirs: [fixtureRoot.homeDir],
      entryReads: buildTestEntryReads({ privateBytes: MIN_ALLOCATED_BYTES + 4096 }),
    });
    const unread = await findFiles({
      rootDirs: [fixtureRoot.homeDir],
      entryReads: buildTestEntryReads({ privateBytes: null }),
    });

    expect(read.findings).toMatchObject([
      { path: largePath, allocatedBytes: MIN_ALLOCATED_BYTES + 4096, privateSizeFallbackCount: 0 },
    ]);
    expect(unread.findings).toMatchObject([
      {
        path: largePath,
        allocatedBytes: await loadEntryAllocatedBytes({ path: largePath }),
        privateSizeFallbackCount: 1,
      },
    ]);
  });

  testOnPosix('an unreadable folder gives an issue while its siblings are searched', async () => {
    const lockedDir = join(fixtureRoot.homeDir, 'a-locked');
    await createFixtureDirectory({ path: lockedDir });
    await createFixtureFile({
      path: join(lockedDir, 'hidden.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await chmod(lockedDir, 0o000);
    const openDir = join(fixtureRoot.homeDir, 'b-open');
    await createFixtureDirectory({ path: openDir });
    const visiblePath = join(openDir, 'visible.bin');
    await createFixtureFile({
      path: visiblePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({ rootDirs: [fixtureRoot.homeDir] });

    expect(result.findings.map((finding) => finding.path)).toEqual([visiblePath]);
    expect(result.issues).toEqual([
      { path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
  });

  test('a passed deadline stops the walk with one walkStopped issue', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findFiles({
      rootDirs: [fixtureRoot.homeDir, fixtureRoot.tempDir],
      deadlineMs: 0,
    });

    expect(result).toEqual({
      findings: [],
      issues: [{ path: fixtureRoot.homeDir, reason: 'walkStopped', detail: 'deadline' }],
    });
  });

  test('a missing root adds nothing', async () => {
    const result = await findFiles({ rootDirs: [join(fixtureRoot.homeDir, 'absent')] });

    expect(result).toEqual({ findings: [], issues: [] });
  });
});
