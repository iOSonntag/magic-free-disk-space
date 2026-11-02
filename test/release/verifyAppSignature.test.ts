import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import type { FixtureCommandRun } from './releaseScriptFixtures.js';
import { createFixtureBinDir, runReleaseScript } from './releaseScriptFixtures.js';

const EXECUTABLE_NAME = 'Magic Free Disk Space';
const BRIDGE_NAME = 'magic-free-disk-space-bridge';
const DYLIB_NAME = 'FlutterMacOS';
const EXECUTABLE_KIND =
  'Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]';
const DYLIB_KIND =
  'Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit dynamically linked shared library x86_64] [arm64]';
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
const BRIDGE_ENTITLEMENT_LINES = [
  '\t<key>com.apple.security.cs.allow-jit</key>',
  '\t<true/>',
  '\t<key>com.apple.security.cs.allow-unsigned-executable-memory</key>',
  '\t<true/>',
];
const GET_TASK_ALLOW_TRUE_LINES = ['\t<key>com.apple.security.get-task-allow</key>', '\t<true/>'];
const GET_TASK_ALLOW_FALSE_LINES = ['\t<key>com.apple.security.get-task-allow</key>', '\t<false/>'];

type FixtureApp = {
  appDir: string;
  executablePath: string;
  bridgePath: string;
  dylibPath: string;
  /** Holds the entitlements the fake `codesign` prints, per file basename and architecture. */
  entitlementsDir: string;
};

type Architecture = 'arm64' | 'x86_64';

describe('verifyAppSignature.sh', () => {
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
    const appDir = join(fixtureRoot.rootDir, `${EXECUTABLE_NAME}.app`);
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

  function buildFakeCodesignBody(): string {
    return `app='${fixtureApp.appDir}'
bridge='${fixtureApp.bridgePath}'
entitlements_dir='${fixtureApp.entitlementsDir}'
case "$*" in
  "--verify --deep --strict --verbose=2 $app")
    exit 0 ;;
  "-dvv $app")
    printf '%s\\n' 'Identifier=com.example.app' 'Authority=Developer ID Application: Test (ABCDE12345)' 'TeamIdentifier=ABCDE12345' 'Timestamp=1 Nov 2026 at 12:00:00' >&2
    exit 0 ;;
  "-dvv --architecture "*)
    printf '%s\\n' 'Authority=Developer ID Application: Test (ABCDE12345)' 'Timestamp=1 Nov 2026 at 12:00:00' 'CodeDirectory v=20500 size=1 flags=0x10000(runtime) hashes=1+1 location=embedded' >&2
    exit 0 ;;
  "-dv $bridge")
    echo 'Identifier=com.example.bridge' >&2
    exit 0 ;;
  "-d --entitlements - --xml $bridge")
    printf '<plist version="1.0">\\n<dict>\\n</dict>\\n</plist>\\n'
    exit 0 ;;
  "-d --entitlements - --xml --architecture "*)
    key="$(basename "$7")-$6"
    if [ -f "$entitlements_dir/$key.unreadable" ]; then
      echo "$7: invalid signature for $6" >&2
      exit 1
    fi
    echo "Executable=$7" >&2
    if [ -f "$entitlements_dir/$key.plist" ]; then cat "$entitlements_dir/$key.plist"; fi
    exit 0 ;;
esac
echo "unexpected arguments: $*" >&2
exit 64`;
  }

  function buildFakeLipoBody(): string {
    return `case "$*" in
  "-archs "*)
    echo 'x86_64 arm64'
    exit 0 ;;
esac
echo "unexpected arguments: $*" >&2
exit 64`;
  }

  function buildFakeFileBody(): string {
    return `executable='${fixtureApp.executablePath}'
bridge='${fixtureApp.bridgePath}'
dylib='${fixtureApp.dylibPath}'
case "$*" in
  "-b $executable" | "-b $bridge")
    echo '${EXECUTABLE_KIND}'
    exit 0 ;;
  "-b $dylib")
    echo '${DYLIB_KIND}'
    exit 0 ;;
  "-b "*)
    echo 'data'
    exit 0 ;;
esac
echo "unexpected arguments: $*" >&2
exit 64`;
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

  async function writeEntitlements(params: {
    path: string;
    architecture: Architecture;
    entryLines: string[];
  }): Promise<void> {
    const key = `${params.path.split('/').at(-1)}-${params.architecture}`;

    await writeFile(
      join(fixtureApp.entitlementsDir, `${key}.plist`),
      buildEntitlementsPlist(params.entryLines),
    );
  }

  async function markEntitlementsUnreadable(params: {
    path: string;
    architecture: Architecture;
  }): Promise<void> {
    const key = `${params.path.split('/').at(-1)}-${params.architecture}`;

    await writeFile(join(fixtureApp.entitlementsDir, `${key}.unreadable`), '');
  }

  async function writeCleanEntitlements(): Promise<void> {
    for (const architecture of ['arm64', 'x86_64'] satisfies Architecture[]) {
      await writeEntitlements({
        path: fixtureApp.executablePath,
        architecture: architecture,
        entryLines: [],
      });
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
    for (const architecture of ['arm64', 'x86_64'] satisfies Architecture[]) {
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
