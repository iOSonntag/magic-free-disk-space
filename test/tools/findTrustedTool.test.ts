import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { findTrustedTool, loadTrustedTool } from '../../src/tools/findTrustedTool.js';
import type { ToolLocation } from '../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

let fixtureRoot: FixtureRoot;

const userId = process.getuid?.() ?? 0;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildAbsoluteLocation(path: string): ToolLocation {
  return { kind: 'path', root: 'absolute', path: path };
}

async function createMise(params: { folder: string; mode?: number }): Promise<string> {
  return createFakeTool({
    folder: join(fixtureRoot.rootDir, params.folder),
    name: 'mise',
    body: 'exit 0',
    mode: params.mode ?? 0o755,
  });
}

describe('findTrustedTool', () => {
  test('returns the real path of a trusted binary', async () => {
    const path = await createMise({ folder: 'trusted' });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(path)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(path) },
    });
  });

  test('follows a symbolic link and returns the real path of its target', async () => {
    const target = await createMise({ folder: 'Cellar/mise/bin' });
    const linkFolder = join(fixtureRoot.rootDir, 'bin');
    const link = join(linkFolder, 'mise');

    await mkdir(linkFolder);
    await symlink('../Cellar/mise/bin/mise', link);

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(link)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(target) },
    });
  });

  test('distrusts a binary its group can write', async () => {
    const path = await createMise({ folder: 'shared', mode: 0o775 });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(path)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'writableByOthers' },
    });
  });

  test('distrusts a file without an execute bit, and a folder', async () => {
    const path = await createMise({ folder: 'plain', mode: 0o644 });
    const folder = join(fixtureRoot.rootDir, 'folder', 'mise');

    await mkdir(folder, { recursive: true });

    const plain = await loadTrustedTool({ name: 'mise', path: path, userId: userId });
    const directory = await loadTrustedTool({ name: 'mise', path: folder, userId: userId });

    expect(plain).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'notExecutableFile' },
    });
    expect(directory).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(folder), detail: 'notExecutableFile' },
    });
  });

  test('distrusts a binary of another user', async () => {
    const path = await createMise({ folder: 'mine' });

    const loaded = await loadTrustedTool({ name: 'mise', path: path, userId: userId + 1 });

    expect(loaded).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'foreignOwner' },
    });
  });

  test('fails as not found when no location has a binary, or a link dangles', async () => {
    const link = join(fixtureRoot.rootDir, 'dangling');

    await symlink(join(fixtureRoot.rootDir, 'gone'), link);

    const found = await findTrustedTool({
      name: 'mise',
      locations: [
        buildAbsoluteLocation(join(fixtureRoot.rootDir, 'missing', 'mise')),
        buildAbsoluteLocation(link),
      ],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({ kind: 'failed', failure: { reason: 'notFound' } });
  });

  test('takes the first trusted location, past missing and untrusted ones', async () => {
    const untrusted = await createMise({ folder: 'first', mode: 0o777 });
    const trusted = await createMise({ folder: 'second' });
    const later = await createMise({ folder: 'third' });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [
        buildAbsoluteLocation(join(fixtureRoot.rootDir, 'missing', 'mise')),
        buildAbsoluteLocation(untrusted),
        buildAbsoluteLocation(trusted),
        buildAbsoluteLocation(later),
      ],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(trusted) },
    });
  });

  test('without a trusted location, names the first binary that exists', async () => {
    const notExecutable = await createMise({ folder: 'first', mode: 0o644 });
    const writable = await createMise({ folder: 'second', mode: 0o777 });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [
        buildAbsoluteLocation(join(fixtureRoot.rootDir, 'missing', 'mise')),
        buildAbsoluteLocation(notExecutable),
        buildAbsoluteLocation(writable),
      ],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'failed',
      failure: {
        reason: 'untrusted',
        path: await realpath(notExecutable),
        detail: 'notExecutableFile',
      },
    });
  });

  test('resolves a home location against the home folder', async () => {
    const path = await createFakeTool({
      folder: join(fixtureRoot.homeDir, '.local', 'bin'),
      name: 'mise',
      body: 'exit 0',
    });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [{ kind: 'path', root: 'home', path: '.local/bin/mise' }],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(path) },
    });
  });

  test('finds the Dart binary of a Flutter SDK that an active root names', async () => {
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');
    const projectDir = join(fixtureRoot.homeDir, 'project');
    const packageConfigPath = join(projectDir, '.dart_tool', 'package_config.json');
    const dart = await createFakeTool({
      folder: join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin'),
      name: 'dart',
      body: 'exit 0',
    });

    await Bun.write(
      packageConfigPath,
      JSON.stringify({ flutterRoot: Bun.pathToFileURL(flutterRoot).href }),
    );
    await Bun.write(
      join(fixtureRoot.homeDir, '.pub-cache', 'active_roots', 'ab', 'abcdef'),
      JSON.stringify({ package_config: Bun.pathToFileURL(packageConfigPath).href }),
    );

    const found = await findTrustedTool({
      name: 'dart',
      locations: [{ kind: 'flutterSdkFromActiveRoots' }],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(dart) },
    });
  });
});

describe("findTrustedTool with Flutter's wrapper of dart", () => {
  /**
   * A made-up Flutter root with its `bin/dart` wrapper and `bin/flutter` script, the SDK binary
   * when `sdkDartMode` is given, and a link to the wrapper at a fixed location, which it returns.
   */
  async function createFlutterLayout(params: { sdkDartMode: number | null }): Promise<{
    linkPath: string;
    sdkDartPath: string;
  }> {
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');
    const linkFolder = join(fixtureRoot.rootDir, 'usr', 'local', 'bin');
    const linkPath = join(linkFolder, 'dart');
    const wrapperPath = await createFakeTool({
      folder: join(flutterRoot, 'bin'),
      name: 'dart',
      body: 'exit 0',
    });

    await createFakeTool({ folder: join(flutterRoot, 'bin'), name: 'flutter', body: 'exit 0' });
    await mkdir(linkFolder, { recursive: true });
    await symlink(wrapperPath, linkPath);

    const sdkDartPath = join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin', 'dart');

    if (params.sdkDartMode !== null) {
      await createFakeTool({
        folder: join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin'),
        name: 'dart',
        body: 'exit 0',
        mode: params.sdkDartMode,
      });
    }

    return { linkPath: linkPath, sdkDartPath: sdkDartPath };
  }

  test('takes the binary of the SDK behind the wrapper', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o755 });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(layout.sdkDartPath) },
    });
  });

  test('finds nothing while the SDK binary is not there', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: null });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({ kind: 'failed', failure: { reason: 'notFound' } });
  });

  test('puts the SDK binary through the trust check', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o775 });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'failed',
      failure: {
        reason: 'untrusted',
        path: await realpath(layout.sdkDartPath),
        detail: 'writableByOthers',
      },
    });
  });

  test('keeps the `bin/dart` of a Dart SDK, which has no Flutter script beside it', async () => {
    const dart = await createFakeTool({
      folder: join(fixtureRoot.rootDir, 'dart-sdk', 'bin'),
      name: 'dart',
      body: 'exit 0',
    });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(dart)],
      homeDir: fixtureRoot.homeDir,
      userId: userId,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(dart) },
    });
  });

  test('loadTrustedTool reads the wrapper the same way', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o755 });

    expect(await loadTrustedTool({ name: 'dart', path: layout.linkPath, userId: userId })).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(layout.sdkDartPath) },
    });
  });
});
