import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { describeOnPosix } from '../support/posixOnly.js';
import type { FixtureCommandRun } from './releaseScriptFixtures.js';
import { createFixtureBinDir, runReleaseScript } from './releaseScriptFixtures.js';

const EXECUTABLE_NAME = 'Magic Free Disk Space';
const BRIDGE_NAME = 'magic-free-disk-space-bridge';
const DYLIB_NAME = 'FlutterMacOS';
const EXECUTABLE_TYPE = 'Mach-O 64-bit executable';
const DYLIB_TYPE = 'Mach-O 64-bit dynamically linked shared library';
const EXECUTABLE_KIND = `Mach-O universal binary with 2 architectures: [x86_64:${EXECUTABLE_TYPE} x86_64] [arm64]`;
const DYLIB_KIND = `Mach-O universal binary with 2 architectures: [x86_64:${DYLIB_TYPE} x86_64] [arm64]`;
const SUCCESS_TEXT = 'and no executable requests get-task-allow.';
const INFO_PLIST_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleExecutable</key>
\t<string>${EXECUTABLE_NAME}</string>
</dict>
</plist>
`;
const BRIDGE_ENTITLEMENT_LINES = ['\t<key>com.apple.security.cs.allow-jit</key>', '\t<true/>'];
const GET_TASK_ALLOW_TRUE_LINES = ['\t<key>com.apple.security.get-task-allow</key>', '\t<true/>'];
const GET_TASK_ALLOW_FALSE_LINES = ['\t<key>com.apple.security.get-task-allow</key>', '\t<false/>'];
/** In the order the fake `lipo` names them. */
const FIXTURE_ARCHITECTURES = ['x86_64', 'arm64'] as const;

type FixtureApp = {
  appDir: string;
  executablePath: string;
  bridgePath: string;
  dylibPath: string;
  /** Holds the entitlements the fake `codesign` prints, per file basename and architecture. */
  entitlementsDir: string;
};

type Architecture = (typeof FIXTURE_ARCHITECTURES)[number];

describeOnPosix('verifyAppSignature.sh', () => {
  let fixtureRoot: FixtureRoot;
  let fixtureApp: FixtureApp;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    fixtureApp = await createFixtureApp();
    await createFakeSigningTools();
    await writeCleanEntitlements();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createFixtureApp(): Promise<FixtureApp> {
    // The folder name holds the word "executable": file -b repeats the path on each architecture line,
    // so the script must tell an executable by its type, not by the path.
    const appDir = join(fixtureRoot.rootDir, 'executables', `${EXECUTABLE_NAME}.app`);
    const macosDir = join(appDir, 'Contents/MacOS');
    const dylibDir = join(appDir, `Contents/Frameworks/${DYLIB_NAME}.framework/Versions/A`);
    const app: FixtureApp = {
      appDir: appDir,
      executablePath: join(macosDir, EXECUTABLE_NAME),
      bridgePath: join(macosDir, BRIDGE_NAME),
      dylibPath: join(dylibDir, DYLIB_NAME),
      entitlementsDir: join(fixtureRoot.rootDir, 'entitlements'),
    };

    await mkdir(macosDir, { recursive: true });
    await mkdir(dylibDir, { recursive: true });
    await mkdir(app.entitlementsDir, { recursive: true });
    await writeFile(join(appDir, 'Contents/Info.plist'), INFO_PLIST_TEXT);
    await writeFile(app.executablePath, 'executable');
    await writeFile(app.bridgePath, 'bridge');
    await writeFile(app.dylibPath, 'dylib');

    return app;
  }

  async function createFakeSigningTools(): Promise<void> {
    const binDir = await createFixtureBinDir({ fixtureRoot: fixtureRoot });

    await createFakeTool({ folder: binDir, name: 'codesign', body: buildFakeCodesignBody() });
    await createFakeTool({ folder: binDir, name: 'lipo', body: buildFakeLipoBody() });
    await createFakeTool({ folder: binDir, name: 'file', body: buildFakeFileBody() });
  }

  /**
   * A fake tool's body around `branches`, which read `args` and `argumentsText`, print through
   * `printLines(fd, lines)`, and end with `process.exit`; any other call exits 64.
   */
  function buildFakeSigningToolBody(branches: string): string {
    return `import * as fs from 'node:fs';
import { basename, join } from 'node:path';

const args = process.argv.slice(2);
const argumentsText = args.join(' ');
const printLines = (fd, lines) => fs.writeSync(fd, lines.map((line) => line + '\\n').join(''));

${branches}

printLines(2, ['unexpected arguments: ' + argumentsText]);
process.exit(64);`;
  }

  function buildFakeCodesignBody(): string {
    return buildFakeSigningToolBody(`const app = ${JSON.stringify(fixtureApp.appDir)};
const bridge = ${JSON.stringify(fixtureApp.bridgePath)};
const entitlementsDir = ${JSON.stringify(fixtureApp.entitlementsDir)};

if (argumentsText === '--verify --deep --strict --verbose=2 ' + app) {
  process.exit(0);
}

if (argumentsText === '-dvv ' + app) {
  printLines(2, [
    'Identifier=com.example.app',
    'Authority=Developer ID Application: Test (ABCDE12345)',
    'TeamIdentifier=ABCDE12345',
    'Timestamp=1 Nov 2026 at 12:00:00',
  ]);
  process.exit(0);
}

if (argumentsText.startsWith('-dvv --architecture ')) {
  printLines(2, [
    'Authority=Developer ID Application: Test (ABCDE12345)',
    'Timestamp=1 Nov 2026 at 12:00:00',
    'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+1 location=embedded',
  ]);
  process.exit(0);
}

if (argumentsText === '-dv ' + bridge) {
  printLines(2, ['Identifier=com.example.bridge']);
  process.exit(0);
}

if (argumentsText === '-d --entitlements - --xml ' + bridge) {
  printLines(1, ['<plist version="1.0">', '<dict>', '</dict>', '</plist>']);
  process.exit(0);
}

if (argumentsText.startsWith('-d --entitlements - --xml --architecture ')) {
  const architecture = args[5];
  const path = args[6];
  const key = basename(path) + '-' + architecture;

  if (fs.existsSync(join(entitlementsDir, key + '.unreadable'))) {
    printLines(2, [path + ': invalid signature for ' + architecture]);
    process.exit(1);
  }

  printLines(2, ['Executable=' + path]);

  if (fs.existsSync(join(entitlementsDir, key + '.plist'))) {
    fs.writeSync(1, fs.readFileSync(join(entitlementsDir, key + '.plist')));
  }

  process.exit(0);
}`);
  }

  function buildFakeLipoBody(): string {
    return buildFakeSigningToolBody(`if (argumentsText.startsWith('-archs ')) {
  printLines(1, [${JSON.stringify(FIXTURE_ARCHITECTURES.join(' '))}]);
  process.exit(0);
}`);
  }

  function buildFakeFileBody(): string {
    return buildFakeSigningToolBody(`const executable = ${JSON.stringify(fixtureApp.executablePath)};
const bridge = ${JSON.stringify(fixtureApp.bridgePath)};
const dylib = ${JSON.stringify(fixtureApp.dylibPath)};
const architectures = ${JSON.stringify(FIXTURE_ARCHITECTURES)};
const printUniversal = (kind, path, type) => {
  const architectureLines = architectures.map(
    (architecture) => path + ' (for architecture ' + architecture + '):\\t' + type + ' ' + architecture,
  );

  printLines(1, [kind, ...architectureLines]);
};

if (argumentsText === '-b ' + executable || argumentsText === '-b ' + bridge) {
  printUniversal(${JSON.stringify(EXECUTABLE_KIND)}, args[1], ${JSON.stringify(EXECUTABLE_TYPE)});
  process.exit(0);
}

if (argumentsText === '-b ' + dylib) {
  printUniversal(${JSON.stringify(DYLIB_KIND)}, args[1], ${JSON.stringify(DYLIB_TYPE)});
  process.exit(0);
}

if (argumentsText.startsWith('-b ')) {
  printLines(1, ['data']);
  process.exit(0);
}`);
  }

  function buildEntitlementsPlist(entryLines: string[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entryLines.join('\n')}
</dict>
</plist>
`;
  }

  /** Builds the path the fake `codesign` reads as `<basename>-<arch>.<extension>`. */
  function buildEntitlementsFixturePath(params: {
    path: string;
    architecture: Architecture;
    extension: 'plist' | 'unreadable';
  }): string {
    return join(
      fixtureApp.entitlementsDir,
      `${basename(params.path)}-${params.architecture}.${params.extension}`,
    );
  }

  async function writeEntitlements(params: {
    path: string;
    architecture: Architecture;
    entryLines: string[];
  }): Promise<void> {
    await writeFile(
      buildEntitlementsFixturePath({
        path: params.path,
        architecture: params.architecture,
        extension: 'plist',
      }),
      buildEntitlementsPlist(params.entryLines),
    );
  }

  async function markEntitlementsUnreadable(params: {
    path: string;
    architecture: Architecture;
  }): Promise<void> {
    await writeFile(
      buildEntitlementsFixturePath({
        path: params.path,
        architecture: params.architecture,
        extension: 'unreadable',
      }),
      '',
    );
  }

  /** The executable requests no entitlement, so the fake prints nothing for it; the bridge its own. */
  async function writeCleanEntitlements(): Promise<void> {
    for (const architecture of FIXTURE_ARCHITECTURES) {
      await writeEntitlements({
        path: fixtureApp.bridgePath,
        architecture: architecture,
        entryLines: BRIDGE_ENTITLEMENT_LINES,
      });
    }
  }

  async function runVerifyAppSignature(): Promise<FixtureCommandRun> {
    return runReleaseScript({
      fixtureRoot: fixtureRoot,
      scriptName: 'verifyAppSignature.sh',
      args: [fixtureApp.appDir],
      workingDir: fixtureRoot.rootDir,
      stdinText: null,
    });
  }

  test('passes a clean app', async () => {
    const run = await runVerifyAppSignature();

    expect(run.stderrText).not.toContain('error:');
    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(`All 3 Mach-O files of ${fixtureApp.appDir}`);
    expect(run.stdoutText).toContain(SUCCESS_TEXT);
  });

  test('fails an executable that requests get-task-allow on one architecture', async () => {
    await writeEntitlements({
      path: fixtureApp.executablePath,
      architecture: 'arm64',
      entryLines: GET_TASK_ALLOW_TRUE_LINES,
    });

    const run = await runVerifyAppSignature();

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(
      `${fixtureApp.executablePath} (arm64) requests com.apple.security.get-task-allow`,
    );
    expect(run.stderrText).toContain('CODE_SIGN_INJECT_BASE_ENTITLEMENTS');
    expect(run.stderrText).not.toContain(`${fixtureApp.executablePath} (x86_64)`);
    expect(run.stdoutText).not.toContain(SUCCESS_TEXT);
  });

  test('passes an executable whose get-task-allow is false', async () => {
    await writeEntitlements({
      path: fixtureApp.executablePath,
      architecture: 'arm64',
      entryLines: GET_TASK_ALLOW_FALSE_LINES,
    });

    const run = await runVerifyAppSignature();

    expect(run.stderrText).not.toContain('error:');
    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(SUCCESS_TEXT);
  });

  test('fails an executable whose entitlements cannot be read on one architecture', async () => {
    await markEntitlementsUnreadable({ path: fixtureApp.bridgePath, architecture: 'x86_64' });

    const run = await runVerifyAppSignature();

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(
      `${fixtureApp.bridgePath} (x86_64): cannot read its entitlements: ${fixtureApp.bridgePath}: invalid signature for x86_64`,
    );
    expect(run.stdoutText).not.toContain(SUCCESS_TEXT);
  });

  test('does not check the entitlements of a dylib', async () => {
    for (const architecture of FIXTURE_ARCHITECTURES) {
      await writeEntitlements({
        path: fixtureApp.dylibPath,
        architecture: architecture,
        entryLines: GET_TASK_ALLOW_TRUE_LINES,
      });
    }

    const run = await runVerifyAppSignature();

    expect(run.stderrText).not.toContain('error:');
    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(SUCCESS_TEXT);
  });
});
