import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildAsdfVersionFindings } from '../../src/explore/asdfVersions/buildAsdfVersionFindings.js';
import { compareAsdfVersionUnit } from '../../src/explore/asdfVersions/compareAsdfVersionUnit.js';
import { decideAsdfVersionOffers } from '../../src/explore/asdfVersions/decideAsdfVersionOffers.js';
import type {
  AsdfState,
  AsdfStateInstalled,
  AsdfVersionFolderParsed,
} from '../../src/explore/asdfVersions/loadAsdfState.js';
import {
  parseAsdfToolName,
  parseAsdfToolVersion,
} from '../../src/explore/asdfVersions/parseAsdfInstallNames.js';
import { isAsdfLegacyVersionFileOn } from '../../src/explore/asdfVersions/parseAsdfrcText.js';
import { parseAsdfToolVersionsPins } from '../../src/explore/asdfVersions/parseAsdfToolVersionsPins.js';
import { parseToolVersionsText } from '../../src/explore/asdfVersions/parseToolVersionsText.js';
import { recheckAsdfVersionUnit } from '../../src/explore/asdfVersions/recheckAsdfVersionUnit.js';
import type { ExploreToolUnitAsdfVersion } from '../../src/explore/exploreUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileRef,
  ProjectPinFileText,
} from '../../src/explore/projectPins/projectPins.js';
import {
  PINNED_VERSION_REINSTALL_EXPLANATION,
  PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
} from '../../src/explore/projectPins/projectSearchEvidence.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestAsdfToolName,
  buildTestAsdfToolVersion,
} from '../support/parsedValueFixtures.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import {
  buildFoundProjectPinsLoad,
  buildTestPinFileText,
  buildTestPinFileUnfit,
  buildTestPinFileUnreadable,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const TIMEOUT_MS = 10_000;

const tool: LocatedTool = { name: 'asdf', path: '/opt/example/bin/asdf' };

const nodeToolName = buildTestAsdfToolName({ text: 'nodejs' });

const oldVersion = buildTestAsdfToolVersion({ text: '18.0.0' });

const pinnedVersion = buildTestAsdfToolVersion({ text: '20.11.1' });

const oldFolder: AsdfVersionFolderParsed = {
  kind: 'parsed',
  folderPath: buildTestAbsolutePath({ text: '/home/example/.asdf/installs/nodejs/18.0.0' }),
  asdfToolName: nodeToolName,
  version: oldVersion,
};

const pinnedFolder: AsdfVersionFolderParsed = {
  kind: 'parsed',
  folderPath: buildTestAbsolutePath({ text: '/home/example/.asdf/installs/nodejs/20.11.1' }),
  asdfToolName: nodeToolName,
  version: pinnedVersion,
};

const pinFileText: ProjectPinFileText = {
  path: buildTestAbsolutePath({ text: '/home/example/project/.tool-versions' }),
  kind: 'toolVersions',
  text: 'nodejs 20.11.1\n',
};

const pinFileRef: ProjectPinFileRef = { path: pinFileText.path, kind: pinFileText.kind };

const textPins: ToolPins = { kind: 'texts', files: [pinFileText] };

function buildInstalledState(params: Partial<AsdfStateInstalled>): AsdfState {
  return {
    kind: 'installed',
    folders: params.folders ?? [oldFolder, pinnedFolder],
    links: params.links ?? [],
    legacyVersionFile: params.legacyVersionFile ?? 'off',
  };
}

function buildOldVersionUnit(): ExploreToolUnitAsdfVersion {
  return {
    kind: 'asdfVersion',
    tool: tool,
    asdfToolName: nodeToolName,
    version: oldVersion,
    installPath: oldFolder.folderPath,
    pinFiles: [pinFileRef],
  };
}

describe('parseAsdfToolName and parseAsdfToolVersion', () => {
  test('accept the names asdf installs', () => {
    expect(parseAsdfToolName({ folderName: 'java' }).kind).toBe('succeeded');
    expect(parseAsdfToolVersion({ folderName: 'adoptopenjdk-17.0.1+12' })).toEqual({
      kind: 'succeeded',
      value: buildTestAsdfToolVersion({ text: 'adoptopenjdk-17.0.1+12' }),
    });
  });

  test('refuse a name that starts with - or .', () => {
    expect(parseAsdfToolName({ folderName: '-java' }).kind).toBe('failed');
    expect(parseAsdfToolName({ folderName: '.java' }).kind).toBe('failed');
    expect(parseAsdfToolVersion({ folderName: '--all' }).kind).toBe('failed');
    expect(parseAsdfToolVersion({ folderName: '.1.0' }).kind).toBe('failed');
  });
});

describe('parseToolVersionsText', () => {
  test('reads tool lines and skips comments, blank lines, and lines without a version', () => {
    const text = [
      '# the tools of this project',
      '',
      'nodejs 20.11.1 18.0.0  # two versions',
      '  python   3.12.1',
      'ruby',
      '   ',
    ].join('\n');

    expect(parseToolVersionsText({ text: text })).toEqual([
      { toolName: 'nodejs', versions: ['20.11.1', '18.0.0'] },
      { toolName: 'python', versions: ['3.12.1'] },
    ]);
  });
});

describe('parseAsdfToolVersionsPins', () => {
  test('maps ref: to its folder and drops system and path:', () => {
    const file: ProjectPinFileText = {
      ...pinFileText,
      text: 'golang ref:abc123 1.22.0\npython system\nnodejs path:/opt/node 20.11.1\n',
    };

    expect(parseAsdfToolVersionsPins({ files: [file] })).toEqual([
      { toolName: 'golang', folderName: 'ref-abc123' },
      { toolName: 'golang', folderName: '1.22.0' },
      { toolName: 'nodejs', folderName: '20.11.1' },
    ]);
  });
});

describe('isAsdfLegacyVersionFileOn', () => {
  test('reads the key with spaces and a comment', () => {
    expect(isAsdfLegacyVersionFileOn({ text: '  legacy_version_file =  yes  # on\n' })).toBe(true);
  });

  test('reads the line as asdf does: in any case, in quotes, after a colon, before a ;', () => {
    for (const text of [
      'legacy_version_file = Yes\n',
      'legacy_version_file = YES\n',
      'legacy_version_file = "yes"\n',
      'legacy_version_file = `yes`\n',
      'legacy_version_file = """yes"""\n',
      '"legacy_version_file" = yes\n',
      '`legacy_version_file` = yes\n',
      'legacy_version_file: yes\n',
      'legacy_version_file = yes ; on\n',
    ]) {
      expect(isAsdfLegacyVersionFileOn({ text: text })).toBe(true);
    }
  });

  test('is off for no, a commented line, or another key', () => {
    expect(isAsdfLegacyVersionFileOn({ text: 'legacy_version_file = no\n' })).toBe(false);
    expect(isAsdfLegacyVersionFileOn({ text: '# legacy_version_file = yes\n' })).toBe(false);
    expect(isAsdfLegacyVersionFileOn({ text: 'always_keep_download = yes\n' })).toBe(false);
  });

  test('reads a quoted key and a quoted value as go-ini does', () => {
    for (const text of [
      '" legacy_version_file " = yes\n',
      '"legacy_version_file" x = yes\n',
      'legacy_version_file = `yes` x\n',
      "legacy_version_file = 'yes'\n",
    ]) {
      expect(isAsdfLegacyVersionFileOn({ text: text })).toBe(true);
    }
  });

  test('is off for a key in single quotes or a quoted value with text after it', () => {
    expect(isAsdfLegacyVersionFileOn({ text: "'legacy_version_file' = yes\n" })).toBe(false);
    expect(isAsdfLegacyVersionFileOn({ text: 'legacy_version_file = "yes" x\n' })).toBe(false);
  });

  test('follows a value a trailing \\ continues, as go-ini does', () => {
    for (const text of [
      'legacy_version_file = yes\\\n\n',
      'legacy_version_file = yes\\',
      'legacy_version_file = \\\nyes\n',
      'legacy_version_file = ye\\\n  s\n',
      'legacy_version_file = y\\\ne\\\ns\n',
    ]) {
      expect(isAsdfLegacyVersionFileOn({ text: text })).toBe(true);
    }

    for (const text of [
      'legacy_version_file = yes\\\nx = y\n',
      'legacy_version_file = yes # c\\\n\n',
    ]) {
      expect(isAsdfLegacyVersionFileOn({ text: text })).toBe(false);
    }
  });
});

describe('decideAsdfVersionOffers', () => {
  test('offers each version no .tool-versions names', () => {
    const offers = decideAsdfVersionOffers({ state: buildInstalledState({}), toolPins: textPins });

    expect(offers).toEqual({ offers: [oldFolder], isComplete: true });
  });

  test('a pin of a link pins the folder it resolves to', () => {
    const state = buildInstalledState({
      links: [{ asdfToolName: nodeToolName, linkName: 'lts', folderName: '18.0.0' }],
    });
    const toolPins: ToolPins = {
      kind: 'texts',
      files: [{ ...pinFileText, text: 'nodejs lts\n' }],
    };

    expect(decideAsdfVersionOffers({ state: state, toolPins: toolPins })).toEqual({
      offers: [pinnedFolder],
      isComplete: true,
    });
  });

  test('offers nothing and is judged when every version is pinned', () => {
    expect(
      decideAsdfVersionOffers({
        state: buildInstalledState({}),
        toolPins: { kind: 'everyVersionPinned' },
      }),
    ).toEqual({ offers: [], isComplete: true });
  });

  test('offers nothing and is not judged for a refused folder when every version is pinned', () => {
    const state = buildInstalledState({
      folders: [
        oldFolder,
        { kind: 'unparsed', folderPath: buildTestAbsolutePath({ text: '/home/example/x/_odd' }) },
      ],
    });

    const toolPins: ToolPins = { kind: 'everyVersionPinned' };

    expect(decideAsdfVersionOffers({ state: state, toolPins: toolPins })).toEqual({
      offers: [],
      isComplete: false,
    });
  });

  test('offers nothing and is not judged while legacy_version_file is on or unknown', () => {
    for (const legacyVersionFile of ['on', 'unknown'] as const) {
      expect(
        decideAsdfVersionOffers({
          state: buildInstalledState({ legacyVersionFile: legacyVersionFile }),
          toolPins: textPins,
        }),
      ).toEqual({ offers: [], isComplete: false });
    }
  });

  test('is not judged for a refused folder, and still offers the others', () => {
    const state = buildInstalledState({
      folders: [
        oldFolder,
        { kind: 'unparsed', folderPath: buildTestAbsolutePath({ text: '/home/example/x/_odd' }) },
      ],
    });

    expect(decideAsdfVersionOffers({ state: state, toolPins: textPins })).toEqual({
      offers: [oldFolder],
      isComplete: false,
    });
  });

  test('is judged with no offers when nothing is installed', () => {
    expect(decideAsdfVersionOffers({ state: { kind: 'noInstalls' }, toolPins: textPins })).toEqual({
      offers: [],
      isComplete: true,
    });
  });
});

describe('buildAsdfVersionFindings', () => {
  test('builds a careful finding with its pin files and evidence', () => {
    const findings = buildAsdfVersionFindings({
      tool: tool,
      offers: [oldFolder],
      pinFiles: [pinFileRef],
      projectPins: buildTestProjectPins({ files: [], isWalkComplete: false }),
      processCommands: [],
    });

    expect(findings).toEqual([
      {
        unit: buildOldVersionUnit(),
        title: 'asdf nodejs 18.0.0',
        explanation: `A tool version installed with asdf that no \`.tool-versions\` found asks for. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
        regeneration: 'asdf installs it again when a project asks for it.',
        risk: 'careful',
        evidenceLines: [
          'None of the `.tool-versions` found (1) names nodejs 18.0.0.',
          PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
        ],
        displayPath: oldFolder.folderPath,
        activity: 'idle',
      },
    ]);
  });

  test('is busy while a process runs from the folder', () => {
    const findings = buildAsdfVersionFindings({
      tool: tool,
      offers: [oldFolder],
      pinFiles: [pinFileRef],
      projectPins: buildTestProjectPins({ files: [] }),
      processCommands: [`${oldFolder.folderPath}/bin/node server.js`],
    });

    expect(findings[0]?.activity).toBe('busy');
    expect(findings[0]?.evidenceLines).toHaveLength(1);
  });
});

describe('compareAsdfVersionUnit', () => {
  test('is unchanged while the version is still offered and idle', () => {
    expect(
      compareAsdfVersionUnit({
        unit: buildOldVersionUnit(),
        state: buildInstalledState({}),
        toolPins: textPins,
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed when a pin now names the version, or legacy_version_file is on', () => {
    const unit = buildOldVersionUnit();
    const nowPinned: ToolPins = {
      kind: 'texts',
      files: [{ ...pinFileText, text: 'nodejs 18.0.0\n' }],
    };

    expect(
      compareAsdfVersionUnit({
        unit: unit,
        state: buildInstalledState({}),
        toolPins: nowPinned,
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
    expect(
      compareAsdfVersionUnit({
        unit: unit,
        state: buildInstalledState({ legacyVersionFile: 'on' }),
        toolPins: textPins,
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed when the folder is gone', () => {
    expect(
      compareAsdfVersionUnit({
        unit: buildOldVersionUnit(),
        state: buildInstalledState({ folders: [pinnedFolder] }),
        toolPins: textPins,
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while the processes are unknown', () => {
    expect(
      compareAsdfVersionUnit({
        unit: buildOldVersionUnit(),
        state: buildInstalledState({}),
        toolPins: textPins,
        processCommands: null,
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('the asdf probe and recheck against a fixture home', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildInstallPath(params: { toolName: string; version: string }): string {
    return join(environment.homeDir, '.asdf', 'installs', params.toolName, params.version);
  }

  async function writeVersionFolder(params: { toolName: string; version: string }): Promise<void> {
    await mkdir(join(buildInstallPath(params), 'bin'), { recursive: true });
  }

  async function writeInstalls(): Promise<void> {
    await writeVersionFolder({ toolName: 'nodejs', version: '18.0.0' });
    await writeVersionFolder({ toolName: 'nodejs', version: '20.11.1' });
    await writeFixtureTextFile({
      path: join(environment.homeDir, '.asdf', 'installs', 'flutter', '.DS_Store'),
      text: '',
    });
  }

  async function writePinFile(params: { text: string }): Promise<string> {
    const path = join(environment.homeDir, 'project', '.tool-versions');

    await writeFixtureTextFile({ path: path, text: params.text });

    return path;
  }

  async function createAsdf(): Promise<string> {
    return createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, 'asdf', 'bin'),
      name: 'asdf',
      answers: [],
    });
  }

  async function runAsdfProbe(params: { files: ProjectPinFile[]; asdfPath: string | null }) {
    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations(
        params.asdfPath === null ? {} : { asdf: params.asdfPath },
      ),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      projectPins: buildFoundProjectPinsLoad({ files: params.files }),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: 0,
    });

    return probes.asdfVersions;
  }

  async function probeOfferedUnit(): Promise<ExploreToolUnitAsdfVersion> {
    await writeInstalls();
    const pinPath = await writePinFile({ text: 'nodejs 20.11.1\n' });
    const outcome = await runAsdfProbe({
      files: [
        buildTestPinFileText({ path: pinPath, kind: 'toolVersions', text: 'nodejs 20.11.1\n' }),
      ],
      asdfPath: await createAsdf(),
    });

    if (outcome.kind !== 'probed' || outcome.findings[0]?.unit.kind !== 'asdfVersion') {
      throw new Error(`the probe offered no asdf version: ${outcome.kind}`);
    }

    return outcome.findings[0].unit;
  }

  async function recheckUnit(params: {
    unit: ExploreToolUnitAsdfVersion;
    processCommands: string[] | null;
  }) {
    return recheckAsdfVersionUnit({
      unit: params.unit,
      run: {
        tool: params.unit.tool,
        environment: environment,
        deadlineMs: Date.now() + TIMEOUT_MS,
        processCommands: params.processCommands,
      },
    });
  }

  test('offers the version no .tool-versions names, with the located asdf', async () => {
    await writeInstalls();
    const asdfPath = await createAsdf();
    const pinPath = await writePinFile({ text: 'nodejs 20.11.1\n' });

    expect(
      await runAsdfProbe({
        files: [
          buildTestPinFileText({ path: pinPath, kind: 'toolVersions', text: 'nodejs 20.11.1\n' }),
          buildTestPinFileUnreadable({ path: '/elsewhere/.nvmrc', kind: 'nvmrc' }),
        ],
        asdfPath: asdfPath,
      }),
    ).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'asdfVersion',
            tool: { name: 'asdf', path: await realpath(asdfPath) },
            asdfToolName: nodeToolName,
            version: oldVersion,
            installPath: buildInstallPath({ toolName: 'nodejs', version: '18.0.0' }),
            pinFiles: [{ path: pinPath, kind: 'toolVersions' }],
          },
          risk: 'careful',
          activity: 'idle',
        }),
      ],
      isComplete: true,
    });
  });

  test('a pin of a link in the tool folder pins the folder it points to', async () => {
    await writeInstalls();
    await symlink('./18.0.0', buildInstallPath({ toolName: 'nodejs', version: 'lts' }));
    await symlink('/nowhere', buildInstallPath({ toolName: 'nodejs', version: 'gone' }));

    expect(
      await runAsdfProbe({
        files: [
          buildTestPinFileText({
            path: '/project/.tool-versions',
            kind: 'toolVersions',
            text: 'nodejs lts 20.11.1\n',
          }),
        ],
        asdfPath: await createAsdf(),
      }),
    ).toEqual({ kind: 'probed', findings: [], isComplete: true });
  });

  test('is not judged while ~/.asdfrc sets legacy_version_file = yes', async () => {
    await writeInstalls();
    await writeFile(join(environment.homeDir, '.asdfrc'), 'legacy_version_file = yes\n');

    expect(await runAsdfProbe({ files: [], asdfPath: await createAsdf() })).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: false,
    });
  });

  test('is not judged while ~/.asdfrc sets legacy_version_file to Yes', async () => {
    await writeInstalls();
    await writeFile(join(environment.homeDir, '.asdfrc'), 'legacy_version_file = Yes\n');

    expect(await runAsdfProbe({ files: [], asdfPath: await createAsdf() })).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: false,
    });
  });

  test('answers unreadable at a .tool-versions it could not read', async () => {
    await writeInstalls();

    expect(
      await runAsdfProbe({
        files: [
          buildTestPinFileUnreadable({ path: '/project/.tool-versions', kind: 'toolVersions' }),
        ],
        asdfPath: await createAsdf(),
      }),
    ).toEqual({
      kind: 'unreadable',
      path: '/project/.tool-versions',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });

  test('offers nothing and is judged when a .tool-versions is unfit', async () => {
    await writeInstalls();

    expect(
      await runAsdfProbe({
        files: [buildTestPinFileUnfit({ path: '/project/.tool-versions', kind: 'toolVersions' })],
        asdfPath: await createAsdf(),
      }),
    ).toEqual({ kind: 'probed', findings: [], isComplete: true });
  });

  test('is judged with no findings without an installs folder', async () => {
    expect(await runAsdfProbe({ files: [], asdfPath: await createAsdf() })).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: true,
    });
  });

  test('is not judged for a refused folder name, and offers the others', async () => {
    await writeInstalls();
    await writeVersionFolder({ toolName: 'nodejs', version: '_odd' });

    const outcome = await runAsdfProbe({ files: [], asdfPath: await createAsdf() });

    expect(outcome).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({ title: 'asdf nodejs 18.0.0' }),
        expect.objectContaining({ title: 'asdf nodejs 20.11.1' }),
      ],
      isComplete: false,
    });
  });

  test('answers tool missing when asdf is not located', async () => {
    await writeInstalls();

    const outcome = await runAsdfProbe({
      files: [],
      asdfPath: join(fixtureRoot.rootDir, 'absent', 'asdf'),
    });

    expect(outcome.kind).toBe('toolMissing');
  });

  test('the recheck answers unchanged while nothing changed', async () => {
    const unit = await probeOfferedUnit();

    expect(await recheckUnit({ unit: unit, processCommands: [] })).toEqual({ kind: 'unchanged' });
  });

  test('the recheck answers changed when a pin file now names the version', async () => {
    const unit = await probeOfferedUnit();

    await writePinFile({ text: 'nodejs 20.11.1 18.0.0\n' });

    expect(await recheckUnit({ unit: unit, processCommands: [] })).toEqual({ kind: 'changed' });
  });

  test('the recheck answers changed when the folder is gone', async () => {
    const unit = await probeOfferedUnit();

    await rm(unit.installPath, { recursive: true });

    expect(await recheckUnit({ unit: unit, processCommands: [] })).toEqual({ kind: 'changed' });
  });

  test('the recheck answers busy while a process runs from the folder', async () => {
    const unit = await probeOfferedUnit();

    expect(
      await recheckUnit({
        unit: unit,
        processCommands: [`${unit.installPath}/bin/node server.js`],
      }),
    ).toEqual({ kind: 'busy' });
  });

  test('the recheck fails when a pin file is unreadable', async () => {
    const unit = await probeOfferedUnit();
    const pinPath = join(environment.homeDir, 'project', '.tool-versions');

    await chmod(pinPath, 0o000);

    try {
      expect(await recheckUnit({ unit: unit, processCommands: [] })).toEqual({
        kind: 'failed',
        failure: {
          reason: 'fileUnreadable',
          path: pinPath,
          failure: { reason: 'permissionDenied', code: 'EACCES' },
        },
      });
    } finally {
      await chmod(pinPath, 0o600);
    }
  });
});
