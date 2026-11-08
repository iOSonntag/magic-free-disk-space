import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { findTrustedTool, loadTrustedTool } from '../../src/tools/findTrustedTool.js';
import type { ToolLocation } from '../../src/tools/toolInstallLocations.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { createActiveProject, writeDartVersionFile } from '../support/flutterSdkFixtures.js';
import {
  buildTestUserIdentity,
  exampleWindowsUser,
  hostPathRules,
} from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

let fixtureRoot: FixtureRoot;

const userId = process.getuid?.() ?? 0;

const user = buildTestUserIdentity({ uid: userId });

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
    body: 'process.exit(0);',
    mode: params.mode ?? 0o755,
  });
}

// Trust rests on the POSIX owner and mode of a binary; a Windows user trusts none, as the last
// suite shows.
describe('findTrustedTool', () => {
  testOnPosix('returns the real path of a trusted binary', async () => {
    const path = await createMise({ folder: 'trusted' });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(path)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(path) },
    });
  });

  testOnPosix('follows a symbolic link and returns the real path of its target', async () => {
    const target = await createMise({ folder: 'Cellar/mise/bin' });
    const linkFolder = join(fixtureRoot.rootDir, 'bin');
    const link = join(linkFolder, 'mise');

    await mkdir(linkFolder);
    await symlink('../Cellar/mise/bin/mise', link);

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(link)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(target) },
    });
  });

  testOnPosix('distrusts a binary its group can write', async () => {
    const path = await createMise({ folder: 'shared', mode: 0o775 });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(path)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'writableByOthers' },
    });
  });

  testOnPosix('distrusts a file without an execute bit, and a folder', async () => {
    const path = await createMise({ folder: 'plain', mode: 0o644 });
    const folder = join(fixtureRoot.rootDir, 'folder', 'mise');

    await mkdir(folder, { recursive: true });

    const plain = await loadTrustedTool({ name: 'mise', path: path, user: user });
    const directory = await loadTrustedTool({ name: 'mise', path: folder, user: user });

    expect(plain).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'notExecutableFile' },
    });
    expect(directory).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(folder), detail: 'notExecutableFile' },
    });
  });

  testOnPosix('distrusts a binary of another user', async () => {
    const path = await createMise({ folder: 'mine' });

    const loaded = await loadTrustedTool({
      name: 'mise',
      path: path,
      user: buildTestUserIdentity({ uid: userId + 1 }),
    });

    expect(loaded).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'foreignOwner' },
    });
  });

  testOnPosix('fails as not found when no location has a binary, or a link dangles', async () => {
    const link = join(fixtureRoot.rootDir, 'dangling');

    await symlink(join(fixtureRoot.rootDir, 'gone'), link);

    const found = await findTrustedTool({
      name: 'mise',
      locations: [
        buildAbsoluteLocation(join(fixtureRoot.rootDir, 'missing', 'mise')),
        buildAbsoluteLocation(link),
      ],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({ kind: 'failed', failure: { reason: 'notFound' } });
  });

  testOnPosix('takes the first trusted location, past missing and untrusted ones', async () => {
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
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(trusted) },
    });
  });

  testOnPosix('without a trusted location, names the first binary that exists', async () => {
    const notExecutable = await createMise({ folder: 'first', mode: 0o644 });
    const writable = await createMise({ folder: 'second', mode: 0o777 });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [
        buildAbsoluteLocation(join(fixtureRoot.rootDir, 'missing', 'mise')),
        buildAbsoluteLocation(notExecutable),
        buildAbsoluteLocation(writable),
      ],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
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

  testOnPosix('resolves a home location against the home folder', async () => {
    const path = await createFakeTool({
      folder: join(fixtureRoot.homeDir, '.local', 'bin'),
      name: 'mise',
      body: 'process.exit(0);',
    });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [{ kind: 'path', root: 'home', path: '.local/bin/mise' }],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'mise', path: await realpath(path) },
    });
  });

  testOnPosix('finds the Dart binary of a Flutter SDK that an active root names', async () => {
    const dart = await createActiveFlutterSdk({
      folder: 'flutter',
      activeRootFileName: 'abcdef',
      version: '3.11.0',
    });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [{ kind: 'flutterSdkFromActiveRoots' }],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(dart) },
    });
  });
});

/**
 * A made-up Flutter root at `folder` with the Dart binary of its SDK, a project whose package
 * config names it, and an active-roots file `ab/<activeRootFileName>` for that project; returns
 * the binary's path. The SDK has a version file when `version` is not `null`.
 */
async function createActiveFlutterSdk(params: {
  folder: string;
  activeRootFileName: string;
  version: string | null;
}): Promise<string> {
  const flutterRoot = join(fixtureRoot.rootDir, params.folder);
  const dart = await createFakeTool({
    folder: join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin'),
    name: 'dart',
    body: 'process.exit(0);',
  });

  if (params.version !== null) {
    await writeDartVersionFile({ dartPath: dart, version: params.version });
  }

  await createActiveProject({
    homeDir: fixtureRoot.homeDir,
    group: 'ab',
    name: params.activeRootFileName,
    flutterRoot: flutterRoot,
  });

  return dart;
}

describe('findTrustedTool with the version of dart', () => {
  testOnPosix('skips a Dart older than 3.11 whose active root sorts first', async () => {
    await createActiveFlutterSdk({
      folder: 'flutter-old',
      activeRootFileName: 'aa',
      version: '3.10.0',
    });
    const supported = await createActiveFlutterSdk({
      folder: 'flutter-new',
      activeRootFileName: 'bb',
      version: '3.11.0',
    });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [{ kind: 'flutterSdkFromActiveRoots' }],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(supported) },
    });
  });

  testOnPosix('fails as not found when only a Dart older than 3.11 exists', async () => {
    await createActiveFlutterSdk({
      folder: 'flutter-old',
      activeRootFileName: 'aa',
      version: '3.10.0',
    });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [{ kind: 'flutterSdkFromActiveRoots' }],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({ kind: 'failed', failure: { reason: 'notFound' } });
  });

  testOnPosix('skips a Dart without a version file and goes on to the next location', async () => {
    await createActiveFlutterSdk({
      folder: 'flutter-unknown',
      activeRootFileName: 'aa',
      version: null,
    });
    const homebrewDart = await createFakeTool({
      folder: join(fixtureRoot.rootDir, 'Cellar', 'dart', 'libexec', 'bin'),
      name: 'dart',
      body: 'process.exit(0);',
    });
    const linkFolder = join(fixtureRoot.rootDir, 'bin');
    const link = join(linkFolder, 'dart');

    await writeDartVersionFile({ dartPath: homebrewDart, version: '3.12.0' });
    await mkdir(linkFolder);
    await symlink(homebrewDart, link);

    const found = await findTrustedTool({
      name: 'dart',
      locations: [{ kind: 'flutterSdkFromActiveRoots' }, buildAbsoluteLocation(link)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(homebrewDart) },
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
      body: 'process.exit(0);',
    });

    await createFakeTool({
      folder: join(flutterRoot, 'bin'),
      name: 'flutter',
      body: 'process.exit(0);',
    });
    await mkdir(linkFolder, { recursive: true });
    await symlink(wrapperPath, linkPath);

    const sdkDartPath = join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin', 'dart');

    if (params.sdkDartMode !== null) {
      await createFakeTool({
        folder: join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin'),
        name: 'dart',
        body: 'process.exit(0);',
        mode: params.sdkDartMode,
      });
      await writeDartVersionFile({ dartPath: sdkDartPath, version: '3.11.0' });
    }

    return { linkPath: linkPath, sdkDartPath: sdkDartPath };
  }

  testOnPosix('takes the binary of the SDK behind the wrapper', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o755 });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(layout.sdkDartPath) },
    });
  });

  testOnPosix('takes the SDK binary while the Flutter script is a dangling link', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o755 });
    const flutterScriptPath = join(fixtureRoot.rootDir, 'flutter', 'bin', 'flutter');

    await rm(flutterScriptPath);
    await symlink(join(fixtureRoot.rootDir, 'gone'), flutterScriptPath);

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(layout.sdkDartPath) },
    });
  });

  testOnPosix('finds nothing while the SDK binary is not there', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: null });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
    });

    expect(found).toEqual({ kind: 'failed', failure: { reason: 'notFound' } });
  });

  testOnPosix('puts the SDK binary through the trust check', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o775 });

    const found = await findTrustedTool({
      name: 'dart',
      locations: [buildAbsoluteLocation(layout.linkPath)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: user,
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

  testOnPosix(
    'keeps the `bin/dart` of a Dart SDK, which has no Flutter script beside it',
    async () => {
      const dart = await createFakeTool({
        folder: join(fixtureRoot.rootDir, 'dart-sdk', 'bin'),
        name: 'dart',
        body: 'process.exit(0);',
      });

      await writeDartVersionFile({ dartPath: dart, version: '3.11.0' });

      const found = await findTrustedTool({
        name: 'dart',
        locations: [buildAbsoluteLocation(dart)],
        pathRules: hostPathRules,
        homeDir: fixtureRoot.homeDir,
        user: user,
      });

      expect(found).toEqual({
        kind: 'succeeded',
        value: { name: 'dart', path: await realpath(dart) },
      });
    },
  );

  testOnPosix('loadTrustedTool reads the wrapper the same way', async () => {
    const layout = await createFlutterLayout({ sdkDartMode: 0o755 });

    expect(await loadTrustedTool({ name: 'dart', path: layout.linkPath, user: user })).toEqual({
      kind: 'succeeded',
      value: { name: 'dart', path: await realpath(layout.sdkDartPath) },
    });
  });
});

describe('findTrustedTool for a Windows user', () => {
  test('trusts no binary, and names the first one it found with its owner unchecked', async () => {
    const path = await createMise({ folder: 'first' });
    const later = await createMise({ folder: 'second' });

    const found = await findTrustedTool({
      name: 'mise',
      locations: [buildAbsoluteLocation(path), buildAbsoluteLocation(later)],
      pathRules: hostPathRules,
      homeDir: fixtureRoot.homeDir,
      user: exampleWindowsUser,
    });

    expect(found).toEqual({
      kind: 'failed',
      failure: { reason: 'untrusted', path: await realpath(path), detail: 'ownerUnchecked' },
    });
  });
});
