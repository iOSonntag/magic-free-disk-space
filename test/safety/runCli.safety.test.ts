import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { runCli } from '../../src/cli/runCli.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { createScriptedTerminalIo } from '../support/scriptedTerminalIo.js';

const MIB = 1_048_576;
const NOW_MS = Date.now();
const OLD_MS = NOW_MS - 400 * 86_400_000;

// The catalog of these tests: home and temp entries only, so no test reads a real system folder.
const TEST_CATALOG: CatalogEntry[] = [
  buildTestCatalogEntry({
    id: 'tool-cache',
    title: 'Tool cache',
    path: 'Library/Caches/ToolCache',
    risk: 'safe',
  }),
  buildTestCatalogEntry({
    id: 'tool-advice',
    title: 'Tool store',
    path: 'Library/ToolStore',
    risk: 'review',
    removal: { kind: 'advice', advice: 'Run the tool prune command.' },
  }),
  buildTestCatalogEntry({
    id: 'user-caches',
    title: 'App cache',
    path: 'Library/Caches',
    scope: 'children',
    risk: 'review',
  }),
  buildTestCatalogEntry({
    id: 'temporary',
    category: 'temporary',
    title: 'Temporary files',
    root: 'temp',
    path: '',
    scope: 'children',
    ageRule: 'staleDays',
    risk: 'safe',
  }),
];

let fixtureRoot: FixtureRoot;
let environment: Environment;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
  await createFixtureHome();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function createSizedFile(path: string, sizeBytes: number): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await createFixtureFile({ path: path, sizeBytes: sizeBytes, modifiedMs: OLD_MS });
}

/**
 * Builds a home where the ranking is fixed: 1 the tool cache (4 MiB, safe), 2 another app's
 * cache (3 MiB, review), 3 a stale temp folder (2 MiB, safe). Plus things never offered.
 */
async function createFixtureHome(): Promise<void> {
  const home = fixtureRoot.homeDir;

  await createSizedFile(join(home, 'Library/Caches/ToolCache/blob.bin'), 4 * MIB);
  await createSizedFile(join(home, 'Library/Caches/com.example.other/blob.bin'), 3 * MIB);
  await createSizedFile(join(home, 'Library/Caches/com.apple.system/blob.bin'), 5 * MIB);
  await createSizedFile(join(home, 'Library/ToolStore/store.bin'), 6 * MIB);
  await createSizedFile(join(home, 'Documents/thesis.txt'), 2 * MIB);
  await createSizedFile(join(fixtureRoot.tempDir, 'build-old/out.bin'), 2 * MIB);
  await updateModifiedMs({ path: join(fixtureRoot.tempDir, 'build-old'), modifiedMs: OLD_MS });
  await createSizedFile(join(fixtureRoot.tempDir, 'build-fresh/out.bin'), 2 * MIB);
  await updateModifiedMs({
    path: join(fixtureRoot.tempDir, 'build-fresh/out.bin'),
    modifiedMs: NOW_MS,
  });
}

/** Every file and folder under the fixture root, except the log folder a deletion creates. */
async function listFixturePaths(): Promise<string[]> {
  const entries = await readdir(fixtureRoot.rootDir, { recursive: true });

  return entries
    .map((entry) => relative(fixtureRoot.rootDir, join(fixtureRoot.rootDir, entry)))
    .filter((path) => !path.startsWith('home/Library/Logs'))
    .toSorted();
}

async function runWithInput(params: {
  argv: string[];
  inputLines: string[];
  isTerminal?: boolean;
}) {
  const io = createScriptedTerminalIo({
    isTerminal: params.isTerminal ?? true,
    inputLines: params.inputLines,
  });
  const exitCode = await runCli({
    argv: params.argv,
    environment: environment,
    catalogEntries: TEST_CATALOG,
    io: io,
  });

  return { exitCode: exitCode, io: io };
}

describe('runCli safety', () => {
  test('the ranking of the fixture home is the one these tests rely on', async () => {
    const { exitCode, io } = await runWithInput({ argv: ['--list'], inputLines: [] });
    const out = io.outText();

    expect(exitCode).toBe(0);
    expect(out).toContain('1. 4.0 MiB [safe] Tool cache');
    expect(out).toContain('2. 3.0 MiB [review] App cache');
    expect(out).toContain('3. 2.0 MiB [safe] Temporary files');
    expect(out).not.toContain('4. ');
    expect(out).toContain('Run the tool prune command.');
    expect(out).not.toContain('com.apple.system');
  });

  test('--list deletes nothing', async () => {
    const before = await listFixturePaths();
    const { exitCode, io } = await runWithInput({
      argv: ['--list'],
      inputLines: ['1-3', 'DELETE'],
    });

    expect(exitCode).toBe(0);
    expect(io.prompts).toEqual([]);
    expect(await listFixturePaths()).toEqual(before);
  });

  test('--dry-run with a selection plans and deletes nothing', async () => {
    const before = await listFixturePaths();
    const { exitCode, io } = await runWithInput({
      argv: ['--dry-run', '--select', '1-3'],
      inputLines: [],
      isTerminal: false,
    });

    expect(exitCode).toBe(0);
    expect(io.outText()).toContain('These 3 items will be deleted permanently');
    expect(io.outText()).toContain('Dry run: nothing was deleted.');
    expect(await listFixturePaths()).toEqual(before);
  });

  test('refuses an interactive run without a terminal, before scanning', async () => {
    const before = await listFixturePaths();
    const { exitCode, io } = await runWithInput({
      argv: [],
      inputLines: ['1', 'DELETE'],
      isTerminal: false,
    });

    expect(exitCode).toBe(3);
    expect(io.outText()).toBe('');
    expect(io.prompts).toEqual([]);
    expect(await listFixturePaths()).toEqual(before);
  });

  test('deletes exactly the selected item after DELETE, and logs it', async () => {
    const before = await listFixturePaths();
    const { exitCode } = await runWithInput({ argv: [], inputLines: ['2', 'DELETE'] });
    const after = await listFixturePaths();
    const removedPaths = before.filter((path) => !after.includes(path));
    const log = await readFile(environment.deletionLogPath, 'utf8');

    expect(exitCode).toBe(0);
    expect(removedPaths).toEqual([
      'home/Library/Caches/com.example.other',
      'home/Library/Caches/com.example.other/blob.bin',
    ]);
    expect(after.filter((path) => !before.includes(path))).toEqual([]);
    expect(log).toContain('"kind":"intent"');
    expect(log).toContain('"outcome":"removed"');
  });

  test('"safe" deletes only the safe items', async () => {
    const before = await listFixturePaths();

    await runWithInput({ argv: [], inputLines: ['safe', 'DELETE'] });

    const after = await listFixturePaths();
    const removedPaths = before.filter((path) => !after.includes(path));

    expect(removedPaths).toEqual([
      'home/Library/Caches/ToolCache',
      'home/Library/Caches/ToolCache/blob.bin',
      'tmp/build-old',
      'tmp/build-old/out.bin',
    ]);
  });

  test('anything but the exact word DELETE cancels', async () => {
    const before = await listFixturePaths();

    for (const confirmation of ['delete', 'yes', 'DELETE please', '']) {
      const { exitCode, io } = await runWithInput({ argv: [], inputLines: ['1-3', confirmation] });

      expect(exitCode).toBe(0);
      expect(io.outText()).toContain('Cancelled. Nothing was deleted.');
    }

    expect(await listFixturePaths()).toEqual(before);
  });

  test('ending the input at either prompt deletes nothing', async () => {
    const before = await listFixturePaths();

    await runWithInput({ argv: [], inputLines: [] });
    await runWithInput({ argv: [], inputLines: ['1-3'] });

    expect(await listFixturePaths()).toEqual(before);
  });

  test('an empty selection and "none" cancel', async () => {
    const before = await listFixturePaths();

    await runWithInput({ argv: [], inputLines: [''] });
    await runWithInput({ argv: [], inputLines: ['none'] });

    expect(await listFixturePaths()).toEqual(before);
  });

  test('an invalid selection asks again and deletes nothing it named', async () => {
    const before = await listFixturePaths();
    const { io } = await runWithInput({ argv: [], inputLines: ['9', 'banana', '1', 'DELETE'] });
    const after = await listFixturePaths();

    expect(io.errorText()).toContain('No item has this number: 9');
    expect(io.prompts.filter((prompt) => prompt.includes('Select items'))).toHaveLength(3);
    expect(before.filter((path) => !after.includes(path))).toEqual([
      'home/Library/Caches/ToolCache',
      'home/Library/Caches/ToolCache/blob.bin',
    ]);
  });

  test('a folder replaced between the scan and the confirmation is left alone', async () => {
    const toolCachePath = join(fixtureRoot.homeDir, 'Library/Caches/ToolCache');
    const io = createScriptedTerminalIo({ isTerminal: true, inputLines: [] });

    io.readLine = async (prompt) => {
      if (prompt.includes('Select items')) {
        return '1';
      }

      await rm(toolCachePath, { recursive: true });
      await mkdir(toolCachePath);
      await writeFile(join(toolCachePath, 'new.txt'), 'written after the scan');

      return 'DELETE';
    };

    const exitCode = await runCli({
      argv: [],
      environment: environment,
      catalogEntries: TEST_CATALOG,
      io: io,
    });

    expect(exitCode).toBe(0);
    expect(io.outText()).toContain('changed since the scan, left alone');
    expect(await readFile(join(toolCachePath, 'new.txt'), 'utf8')).toBe('written after the scan');
  });

  test('stops with exit 4 and deletes nothing when the log cannot be created', async () => {
    await writeFile(join(fixtureRoot.homeDir, 'Library/Logs'), 'a file where the folder belongs');

    const before = await listFixturePaths();
    const { exitCode, io } = await runWithInput({ argv: [], inputLines: ['1-3', 'DELETE'] });

    expect(exitCode).toBe(4);
    expect(io.errorText()).toContain('Nothing was deleted.');
    expect(await listFixturePaths()).toEqual(before);
  });

  test('offers the old container of a removed app, but not one that changed recently', async () => {
    const containersDir = join(fixtureRoot.homeDir, 'Library/Containers');

    await createSizedFile(join(containersDir, 'com.example.gone/Data/blob.bin'), 2 * MIB);
    await updateModifiedMs({
      path: join(containersDir, 'com.example.gone/Data'),
      modifiedMs: OLD_MS,
    });
    await updateModifiedMs({ path: join(containersDir, 'com.example.gone'), modifiedMs: OLD_MS });
    // Its folders keep the time of now: the app still runs from somewhere else.
    await createSizedFile(join(containersDir, 'com.example.elsewhere/Data/blob.bin'), 2 * MIB);

    const { io } = await runWithInput({ argv: ['--list'], inputLines: [] });

    expect(io.outText()).toContain('Data of an app that is no longer installed (com.example.gone)');
    expect(io.outText()).not.toContain('com.example.elsewhere');
  });

  test('offers no container while an installed app could not be read', async () => {
    const containerDir = join(fixtureRoot.homeDir, 'Library/Containers/com.example.gone');

    await createSizedFile(join(containerDir, 'Data/blob.bin'), 2 * MIB);
    await updateModifiedMs({ path: join(containerDir, 'Data'), modifiedMs: OLD_MS });
    await updateModifiedMs({ path: containerDir, modifiedMs: OLD_MS });
    // An app without an Info.plist: its id, and so the container it owns, is unknown.
    await mkdir(join(fixtureRoot.applicationDir, 'Broken.app'));

    const { io } = await runWithInput({ argv: ['--list'], inputLines: [] });

    expect(io.outText()).not.toContain('com.example.gone');
    expect(io.outText()).toContain('- could not read every installed app: 1');
  });

  test('refuses to run anywhere but macOS', async () => {
    const io = createScriptedTerminalIo({ isTerminal: true, inputLines: ['1', 'DELETE'] });
    const exitCode = await runCli({
      argv: [],
      environment: { ...environment, platform: 'linux' },
      catalogEntries: TEST_CATALOG,
      io: io,
    });

    expect(exitCode).toBe(2);
    expect(io.prompts).toEqual([]);
  });

  test('bad usage exits 2 without scanning', async () => {
    const { exitCode, io } = await runWithInput({ argv: ['--frobnicate'], inputLines: [] });

    expect(exitCode).toBe(2);
    expect(io.outText()).toBe('');
  });
});
