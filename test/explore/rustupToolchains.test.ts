import { describe, expect, test } from 'bun:test';
import { join, posix } from 'node:path';
import type { ExploreToolUnitRustupToolchain } from '../../src/explore/exploreUnit.js';
import type { ProjectPinFile } from '../../src/explore/projectPins/projectPins.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import { compareRustupToolchainUnit } from '../../src/explore/rustupToolchains/compareRustupToolchainUnit.js';
import type { RustupState } from '../../src/explore/rustupToolchains/loadRustupState.js';
import { loadRustupToolchainFindings } from '../../src/explore/rustupToolchains/loadRustupToolchainFindings.js';
import type { RustToolchainPins } from '../../src/explore/rustupToolchains/parseRustToolchainPins.js';
import {
  isRustToolchainPinned,
  parseRustToolchainPins,
} from '../../src/explore/rustupToolchains/parseRustToolchainPins.js';
import {
  parseRustupOverrideList,
  parseRustupToolchainList,
} from '../../src/explore/rustupToolchains/parseRustupLists.js';
import { recheckRustupToolchainUnit } from '../../src/explore/rustupToolchains/recheckRustupToolchainUnit.js';
import { parseRustupToolchainName } from '../../src/explore/rustupToolchains/rustupToolchainName.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { createFixtureDirectory, writeFixtureTextFile } from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestHostPath,
  buildTestRustupToolchainName,
} from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeToolRun,
  getProbeFindings,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { createProbeFakeTool } from './probeFakeTools.js';
import {
  buildTestPinFileText,
  buildTestPinText,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const HOST = 'aarch64-apple-darwin';

const UNPINNED: ToolPins = { kind: 'texts', files: [] };

const VALUE_TOOL: LocatedTool = { name: 'rustup', path: '/Users/example/.cargo/bin/rustup' };

const VALUE_TOOLCHAINS_PATH = '/Users/example/.rustup/toolchains';

function parsePinTexts(...files: { path: string; text: string }[]): RustToolchainPins {
  return parseRustToolchainPins({
    files: files.map((file) =>
      buildTestPinText({ path: file.path, kind: 'rustToolchain', text: file.text }),
    ),
  });
}

/** A unit of the toolchain `name` in the folder of `toolchainsPath`, with no pin file. */
function buildValueUnit(params: {
  name: string;
  toolchainsPath: string;
}): ExploreToolUnitRustupToolchain {
  return {
    kind: 'rustupToolchain',
    tool: VALUE_TOOL,
    name: buildTestRustupToolchainName({ text: params.name }),
    toolchainPath: buildTestAbsolutePath({ text: posix.join(params.toolchainsPath, params.name) }),
    pinFiles: [],
  };
}

/** What rustup lists of the unit's toolchain, marked or not, with no override. */
function buildValueState(params: {
  unit: ExploreToolUnitRustupToolchain;
  isMarked: boolean;
}): RustupState {
  return {
    toolchains: [
      {
        name: params.unit.name,
        isMarked: params.isMarked,
        toolchainPath: params.unit.toolchainPath,
      },
    ],
    overrideNames: [],
  };
}

/** A fake rustup in the fixture's `bin` that answers both lists. */
async function createFakeRustup(params: {
  home: FixtureHome;
  toolchainList: string;
  overrideList: string;
}): Promise<LocatedTool> {
  const path = await createProbeFakeTool({
    folder: join(params.home.fixtureRoot.rootDir, 'bin'),
    name: 'rustup',
    answers: [
      { command: 'rustupToolchainList', stdoutText: params.toolchainList, exitCode: 0 },
      { command: 'rustupOverrideList', stdoutText: params.overrideList, exitCode: 0 },
    ],
  });

  return { name: 'rustup', path: path };
}

function buildToolchainPath(params: { home: FixtureHome; name: string }): AbsolutePath {
  return buildTestHostPath({
    text: join(params.home.fixtureRoot.homeDir, '.rustup', 'toolchains', params.name),
  });
}

async function createToolchainFolders(params: {
  home: FixtureHome;
  names: string[];
}): Promise<void> {
  for (const name of params.names) {
    await createFixtureDirectory({
      path: join(buildToolchainPath({ home: params.home, name: name }), 'bin'),
    });
  }
}

describe('parseRustupToolchainList', () => {
  test('reads each toolchain and marks the annotated ones', () => {
    const stdoutText = `stable-${HOST} (active, default)
nightly-2024-01-01-${HOST}
1.75.0-${HOST} (override)
beta-${HOST} (default)
`;

    expect(parseRustupToolchainList({ stdoutText: stdoutText })).toEqual({
      kind: 'succeeded',
      value: [
        { name: buildTestRustupToolchainName({ text: `stable-${HOST}` }), isMarked: true },
        {
          name: buildTestRustupToolchainName({ text: `nightly-2024-01-01-${HOST}` }),
          isMarked: false,
        },
        { name: buildTestRustupToolchainName({ text: `1.75.0-${HOST}` }), isMarked: true },
        { name: buildTestRustupToolchainName({ text: `beta-${HOST}` }), isMarked: true },
      ],
    });
  });

  test("reads no toolchain from rustup's line for none", () => {
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

describe('parseRustupOverrideList', () => {
  test("reads the toolchain of each override and none from rustup's line for none", () => {
    expect(
      parseRustupOverrideList({
        stdoutText: `/Users/example/code/app                 \tnightly-${HOST}\n`,
      }),
    ).toEqual({
      kind: 'succeeded',
      value: [buildTestRustupToolchainName({ text: `nightly-${HOST}` })],
    });
    expect(parseRustupOverrideList({ stdoutText: 'no overrides\n' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('leaves out a word that is no toolchain name', () => {
    expect(parseRustupOverrideList({ stdoutText: '/Users/example/code/app\t--help\n' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });
});

describe('parseRustupToolchainName', () => {
  test('refuses a leading dash, a separator, and a space', () => {
    for (const text of ['-x', 'a/b', 'a b', '']) {
      expect(parseRustupToolchainName({ text: text }).kind).toBe('failed');
    }
  });
});

describe('parseRustToolchainPins', () => {
  test('reads the channel of rust-toolchain.toml and of the legacy file', () => {
    expect(
      parsePinTexts(
        {
          path: '/code/a/rust-toolchain.toml',
          text: `[toolchain]
channel = "1.75.0"
`,
        },
        { path: '/code/b/rust-toolchain', text: 'nightly-2024-01-01\n' },
        {
          path: '/code/c/rust-toolchain',
          text: `[toolchain]
channel = 'beta'
`,
        },
      ),
    ).toEqual({ kind: 'channels', channels: ['1.75.0', 'nightly-2024-01-01', 'beta'] });
  });

  test('pins no installed toolchain for a custom path', () => {
    expect(
      parsePinTexts({
        path: '/code/a/rust-toolchain.toml',
        text: `[toolchain]
path = "/opt/rust"
`,
      }),
    ).toEqual({ kind: 'channels', channels: [] });
  });

  test('pins every toolchain for a file whose channel is unclear', () => {
    for (const text of [
      `[toolchain]
components = ["clippy"]
`,
      'stable nightly\n',
      '-stable\n',
      'stable/x\n',
    ]) {
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

describe('compareRustupToolchainUnit', () => {
  const unit = buildValueUnit({ name: `1.70.0-${HOST}`, toolchainsPath: VALUE_TOOLCHAINS_PATH });

  test('is unchanged while the toolchain is still offered at its folder and idle', () => {
    expect(
      compareRustupToolchainUnit({
        unit: unit,
        state: buildValueState({ unit: unit, isMarked: false }),
        toolPins: UNPINNED,
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once rustup marks the toolchain or lists it in another folder', () => {
    const moved = buildValueUnit({ name: `1.70.0-${HOST}`, toolchainsPath: '/opt/example/rustup' });

    for (const state of [
      buildValueState({ unit: unit, isMarked: true }),
      buildValueState({ unit: moved, isMarked: false }),
    ]) {
      expect(
        compareRustupToolchainUnit({
          unit: unit,
          state: state,
          toolPins: UNPINNED,
          processCommands: [],
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('is changed once a pin names the toolchain, or the pins cover every version', () => {
    for (const toolPins of [
      {
        kind: 'texts',
        files: [
          buildTestPinText({
            path: '/code/a/rust-toolchain',
            kind: 'rustToolchain',
            text: '1.70.0\n',
          }),
        ],
      },
      { kind: 'everyVersionPinned' },
    ] satisfies ToolPins[]) {
      expect(
        compareRustupToolchainUnit({
          unit: unit,
          state: buildValueState({ unit: unit, isMarked: false }),
          toolPins: toolPins,
          processCommands: [],
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('is busy while a program of its own folder runs, or the processes are unknown', () => {
    for (const processCommands of [
      [`${unit.toolchainPath}/libexec/rust-analyzer-proc-macro-srv`],
      null,
    ]) {
      expect(
        compareRustupToolchainUnit({
          unit: unit,
          state: buildValueState({ unit: unit, isMarked: false }),
          toolPins: UNPINNED,
          processCommands: processCommands,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

describe('loadRustupToolchainFindings and recheckRustupToolchainUnit', () => {
  testOnPosix('offers only the toolchain neither marked, overridden, nor pinned', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const names = [
          `stable-${HOST}`,
          `nightly-${HOST}`,
          `1.75.0-${HOST}`,
          `1.70.0-${HOST}`,
          `beta-${HOST}`,
        ];
        await createToolchainFolders({ home: home, names: names });
        const tool = await createFakeRustup({
          home: home,
          toolchainList: `stable-${HOST} (active, default)
nightly-${HOST}
1.75.0-${HOST}
1.70.0-${HOST}
beta-${HOST}
`,
          overrideList: `/Users/example/code/app\tnightly-${HOST}\n`,
        });
        const pinFile: ProjectPinFile = buildTestPinFileText({
          path: buildTestHostPath({
            text: join(home.fixtureRoot.homeDir, 'code', 'rust-toolchain.toml'),
          }),
          kind: 'rustToolchain',
          text: `[toolchain]
channel = "1.75.0"
`,
        });

        const findings = getProbeFindings(
          await loadRustupToolchainFindings({
            run: buildTestProbeToolRun({ environment: home.environment, tool: tool }),
            projectPins: buildTestProjectPins({ files: [pinFile] }),
          }),
        );

        expect(findings.isComplete).toBe(true);
        expect(listUnitsOfKind({ findings: findings, kind: 'rustupToolchain' })).toEqual(
          [`1.70.0-${HOST}`, `beta-${HOST}`].map((name) => ({
            kind: 'rustupToolchain',
            tool: tool,
            name: buildTestRustupToolchainName({ text: name }),
            toolchainPath: buildToolchainPath({ home: home, name: name }),
            pinFiles: [{ path: pinFile.path, kind: 'rustToolchain' }],
          })),
        );
        expect(findings.findings[0]).toMatchObject({ risk: 'review', activity: 'idle' });
      },
    });
  });

  testOnPosix('counts only the toolchain busy whose own program runs', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const names = [`nightly-${HOST}`, `beta-${HOST}`];
        await createToolchainFolders({ home: home, names: names });
        const tool = await createFakeRustup({
          home: home,
          toolchainList: `nightly-${HOST}
beta-${HOST}
`,
          overrideList: 'no overrides\n',
        });
        const nightlyPath = buildToolchainPath({ home: home, name: `nightly-${HOST}` });

        const findings = getProbeFindings(
          await loadRustupToolchainFindings({
            run: buildTestProbeToolRun({
              environment: home.environment,
              tool: tool,
              processCommands: [`${nightlyPath}/libexec/rust-analyzer-proc-macro-srv`],
            }),
            projectPins: buildTestProjectPins({ files: [] }),
          }),
        );

        expect(findings.findings.map((finding) => finding.activity)).toEqual(['busy', 'idle']);
      },
    });
  });

  testOnPosix('skips a listed toolchain without a folder', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const tool = await createFakeRustup({
          home: home,
          toolchainList: `custom\n`,
          overrideList: 'no overrides\n',
        });

        const result = await loadRustupToolchainFindings({
          run: buildTestProbeToolRun({ environment: home.environment, tool: tool }),
          projectPins: buildTestProjectPins({ files: [] }),
        });

        expect(result).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });

  testOnPosix('rechecks unchanged, then changed once a pin names the toolchain', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const name = `1.70.0-${HOST}`;
        await createToolchainFolders({ home: home, names: [name] });
        const tool = await createFakeRustup({
          home: home,
          toolchainList: `${name}\n`,
          overrideList: 'no overrides\n',
        });
        const pinPath = join(home.fixtureRoot.homeDir, 'code', 'rust-toolchain');
        await writeFixtureTextFile({ path: pinPath, text: '1.75.0\n' });
        const unit: ExploreToolUnitRustupToolchain = {
          kind: 'rustupToolchain',
          tool: tool,
          name: buildTestRustupToolchainName({ text: name }),
          toolchainPath: buildToolchainPath({ home: home, name: name }),
          pinFiles: [{ path: buildTestHostPath({ text: pinPath }), kind: 'rustToolchain' }],
        };
        const recheckRun = buildTestProbeToolRun({ environment: home.environment, tool: tool });

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
      },
    });
  });
});
