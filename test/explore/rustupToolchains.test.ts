import { afterEach, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeToolRun } from '../../src/explore/exploreProbe.js';
import type { ExploreToolUnitRustupToolchain } from '../../src/explore/exploreUnit.js';
import type { ProjectPinFile } from '../../src/explore/projectPins/projectPins.js';
import { loadRustupToolchainFindings } from '../../src/explore/rustupToolchains/loadRustupToolchainFindings.js';
import {
  isRustToolchainPinned,
  parseRustToolchainPins,
} from '../../src/explore/rustupToolchains/parseRustToolchainPins.js';
import {
  parseRustupOverrideList,
  parseRustupToolchainList,
} from '../../src/explore/rustupToolchains/parseRustupLists.js';
import { recheckRustupToolchainUnit } from '../../src/explore/rustupToolchains/recheckRustupToolchainUnit.js';
import type { RustupToolchainName } from '../../src/explore/rustupToolchains/rustupToolchainName.js';
import { parseRustupToolchainName } from '../../src/explore/rustupToolchains/rustupToolchainName.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildTestPinFileText, buildTestProjectPins } from './projectPinsFixtures.js';

const HOST = 'aarch64-apple-darwin';

function buildToolchainName(text: string): RustupToolchainName {
  const name = parseRustupToolchainName({ text: text });

  if (name.kind === 'failed') {
    throw new Error(`The toolchain name ${text} did not parse.`);
  }

  return name.value;
}

function parsePinTexts(...files: { path: string; text: string }[]) {
  return parseRustToolchainPins({
    files: files.map((file) => ({
      path: buildTestAbsolutePath({ text: file.path }),
      kind: 'rustToolchain',
      text: file.text,
    })),
  });
}

describeAwaitingWin32Platform('parseRustupToolchainList', () => {
  test('reads each toolchain and marks the annotated ones', () => {
    const stdoutText = `stable-${HOST} (active, default)
nightly-2024-01-01-${HOST}
1.75.0-${HOST} (override)
beta-${HOST} (default)
`;

    expect(parseRustupToolchainList({ stdoutText: stdoutText })).toEqual({
      kind: 'succeeded',
      value: [
        { name: buildToolchainName(`stable-${HOST}`), isMarked: true },
        { name: buildToolchainName(`nightly-2024-01-01-${HOST}`), isMarked: false },
        { name: buildToolchainName(`1.75.0-${HOST}`), isMarked: true },
        { name: buildToolchainName(`beta-${HOST}`), isMarked: true },
      ],
    });
  });

  test('reads no toolchain from rustup line for none', () => {
    expect(parseRustupToolchainList({ stdoutText: 'no installed toolchains\n' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('fails on a name that could start an option or a line of other text', () => {
    for (const stdoutText of ['--help\n', 'error: something went wrong here\n']) {
      expect(parseRustupToolchainList({ stdoutText: stdoutText }).kind).toBe('failed');
    }
  });
});

describeAwaitingWin32Platform('parseRustupOverrideList', () => {
  test('reads the toolchain of each override and none for rustup line for none', () => {
    expect(
      parseRustupOverrideList({
        stdoutText: `/Users/example/code/app                 \tnightly-${HOST}\n`,
      }),
    ).toEqual({ kind: 'succeeded', value: [`nightly-${HOST}`] });
    expect(parseRustupOverrideList({ stdoutText: 'no overrides\n' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });
});

describeAwaitingWin32Platform('parseRustupToolchainName', () => {
  test('refuses a leading dash, a separator, and a space', () => {
    for (const text of ['-x', 'a/b', 'a b', '']) {
      expect(parseRustupToolchainName({ text: text }).kind).toBe('failed');
    }
  });
});

describeAwaitingWin32Platform('parseRustToolchainPins', () => {
  test('reads the channel of rust-toolchain.toml and of the legacy file', () => {
    expect(
      parsePinTexts(
        { path: '/code/a/rust-toolchain.toml', text: '[toolchain]\nchannel = "1.75.0"\n' },
        { path: '/code/b/rust-toolchain', text: 'nightly-2024-01-01\n' },
        { path: '/code/c/rust-toolchain', text: "[toolchain]\nchannel = 'beta'\n" },
      ),
    ).toEqual({ kind: 'channels', channels: ['1.75.0', 'nightly-2024-01-01', 'beta'] });
  });

  test('pins no installed toolchain for a custom path', () => {
    expect(
      parsePinTexts({
        path: '/code/a/rust-toolchain.toml',
        text: '[toolchain]\npath = "/opt/rust"\n',
      }),
    ).toEqual({ kind: 'channels', channels: [] });
  });

  test('pins every toolchain for a file whose channel is unclear', () => {
    for (const text of ['[toolchain]\ncomponents = ["clippy"]\n', 'stable nightly\n']) {
      expect(parsePinTexts({ path: '/code/a/rust-toolchain', text: text })).toEqual({
        kind: 'everyToolchain',
      });
    }
  });

  test('matches a channel to its installed toolchain with the host part', () => {
    const pins = parsePinTexts({ path: '/code/a/rust-toolchain', text: '1.75.0\n' });

    expect(isRustToolchainPinned({ pins: pins, toolchainName: `1.75.0-${HOST}` })).toBe(true);
    expect(isRustToolchainPinned({ pins: pins, toolchainName: `1.76.0-${HOST}` })).toBe(false);
  });
});

describeAwaitingWin32Platform('loadRustupToolchainFindings and recheckRustupToolchainUnit', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  /** A fake rustup that answers both lists from the files the test writes beside it. */
  async function createFakeRustup(params: {
    toolchainList: string;
    overrideList: string;
  }): Promise<LocatedTool> {
    const folder = join(fixtureRoot.rootDir, 'bin');
    const toolchainListPath = join(folder, 'toolchain-list.txt');
    const overrideListPath = join(folder, 'override-list.txt');
    await writeFixtureTextFile({ path: toolchainListPath, text: params.toolchainList });
    await writeFixtureTextFile({ path: overrideListPath, text: params.overrideList });
    const path = await createFakeTool({
      folder: folder,
      name: 'rustup',
      body: `import * as fs from 'node:fs';

const answers: Record<string, string> = {
  'toolchain list': ${JSON.stringify(toolchainListPath)},
  'override list': ${JSON.stringify(overrideListPath)},
};
const answerPath = answers[process.argv.slice(2).join(' ')];

if (answerPath === undefined) {
  process.exit(64);
}

fs.writeSync(1, fs.readFileSync(answerPath));
process.exit(0);`,
    });

    return { name: 'rustup', path: path };
  }

  function buildToolchainPath(name: string) {
    return buildTestAbsolutePath({
      text: join(fixtureRoot.homeDir, '.rustup', 'toolchains', name),
    });
  }

  async function createToolchainFolders(names: string[]): Promise<void> {
    for (const name of names) {
      await createFixtureDirectory({ path: join(buildToolchainPath(name), 'bin') });
    }
  }

  function buildRun(tool: LocatedTool): ExploreProbeToolRun {
    return {
      environment: environment,
      platform: buildTestProbePlatform(),
      processCommands: [],
      deadlineMs: Date.now() + 10_000,
      unusedCutoffMs: 0,
      staleCutoffMs: 0,
      tool: tool,
    };
  }

  testOnPosix('offers only the toolchain neither marked, overridden, nor pinned', async () => {
    const names = [
      `stable-${HOST}`,
      `nightly-${HOST}`,
      `1.75.0-${HOST}`,
      `1.70.0-${HOST}`,
      `beta-${HOST}`,
    ];
    await createToolchainFolders(names);
    const tool = await createFakeRustup({
      toolchainList: `stable-${HOST} (active, default)\nnightly-${HOST}\n1.75.0-${HOST}\n1.70.0-${HOST}\nbeta-${HOST}\n`,
      overrideList: `/Users/example/code/app\tnightly-${HOST}\n`,
    });
    const pinFile: ProjectPinFile = buildTestPinFileText({
      path: join(fixtureRoot.homeDir, 'code', 'rust-toolchain.toml'),
      kind: 'rustToolchain',
      text: '[toolchain]\nchannel = "1.75.0"\n',
    });

    const result = await loadRustupToolchainFindings({
      run: buildRun(tool),
      projectPins: buildTestProjectPins({ files: [pinFile] }),
    });

    if (result.kind === 'failed') {
      throw new Error('The rustup probe failed.');
    }

    expect(result.value.isComplete).toBe(true);
    expect(result.value.findings.map((finding) => finding.unit)).toEqual(
      [`1.70.0-${HOST}`, `beta-${HOST}`].map((name) => ({
        kind: 'rustupToolchain',
        tool: tool,
        name: buildToolchainName(name),
        toolchainPath: buildToolchainPath(name),
        pinFiles: [{ path: pinFile.path, kind: 'rustToolchain' }],
      })),
    );
    expect(result.value.findings[0]).toMatchObject({ risk: 'review', activity: 'idle' });
  });

  testOnPosix('skips a listed toolchain without a folder', async () => {
    const tool = await createFakeRustup({
      toolchainList: `custom\n`,
      overrideList: 'no overrides\n',
    });

    const result = await loadRustupToolchainFindings({
      run: buildRun(tool),
      projectPins: buildTestProjectPins({ files: [] }),
    });

    expect(result).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
  });

  testOnPosix('rechecks unchanged, then changed once a pin names the toolchain', async () => {
    const name = `1.70.0-${HOST}`;
    await createToolchainFolders([name]);
    const tool = await createFakeRustup({
      toolchainList: `${name}\n`,
      overrideList: 'no overrides\n',
    });
    const pinPath = join(fixtureRoot.homeDir, 'code', 'rust-toolchain');
    await writeFixtureTextFile({ path: pinPath, text: '1.75.0\n' });
    const unit: ExploreToolUnitRustupToolchain = {
      kind: 'rustupToolchain',
      tool: tool,
      name: buildToolchainName(name),
      toolchainPath: buildToolchainPath(name),
      pinFiles: [{ path: buildTestAbsolutePath({ text: pinPath }), kind: 'rustToolchain' }],
    };
    const recheckRun = { ...buildRun(tool), platform: buildTestProbePlatform() };

    expect(await recheckRustupToolchainUnit({ unit: unit, run: recheckRun })).toEqual({
      kind: 'unchanged',
    });
    expect(
      await recheckRustupToolchainUnit({
        unit: unit,
        run: { ...recheckRun, processCommands: ['/Users/example/.cargo/bin/cargo build'] },
      }),
    ).toEqual({ kind: 'busy' });

    await writeFixtureTextFile({ path: pinPath, text: '1.70.0\n' });

    expect(await recheckRustupToolchainUnit({ unit: unit, run: recheckRun })).toEqual({
      kind: 'changed',
    });
  });
});
