import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExplorePathUnitNvmVersion,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { buildNvmVersionFindings } from '../../src/explore/nvmVersions/buildNvmVersionFindings.js';
import { compareNvmVersionUnit } from '../../src/explore/nvmVersions/compareNvmVersionUnit.js';
import type { NvmVersionOffers } from '../../src/explore/nvmVersions/decideNvmVersionOffers.js';
import { decideNvmVersionOffers } from '../../src/explore/nvmVersions/decideNvmVersionOffers.js';
import type {
  NvmAliasFile,
  NvmState,
  NvmVersionFolder,
} from '../../src/explore/nvmVersions/loadNvmState.js';
import { parseNvmAliasText } from '../../src/explore/nvmVersions/parseNvmAliasText.js';
import { parseNvmNodeVersion } from '../../src/explore/nvmVersions/parseNvmNodeVersion.js';
import { parseNvmrcPin } from '../../src/explore/nvmVersions/parseNvmrcPin.js';
import { resolveNvmVersionPin } from '../../src/explore/nvmVersions/resolveNvmVersionPin.js';
import type { ProjectPinsLoad } from '../../src/explore/projectPins/loadProjectPins.js';
import type { ProjectPinFileRef } from '../../src/explore/projectPins/projectPins.js';
import {
  PINNED_VERSION_REINSTALL_EXPLANATION,
  PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
} from '../../src/explore/projectPins/projectSearchEvidence.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath, buildTestNvmNodeVersion } from '../support/parsedValueFixtures.js';
import { buildFixtureToolLocations } from './probeFakeTools.js';
import {
  buildEmptyProjectPinsLoad,
  buildFoundProjectPinsLoad,
  buildTestPinFileText,
  buildTestPinFileUnreadable,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const FIXTURE_VERSIONS_PATH = '/home/.nvm/versions/node';

function buildFixtureFolder(params: { folderName: string }): NvmVersionFolder {
  const folderPath = buildTestAbsolutePath({
    text: `${FIXTURE_VERSIONS_PATH}/${params.folderName}`,
  });
  const version = parseNvmNodeVersion({ folderName: params.folderName });

  if (version.kind === 'failed') {
    return { kind: 'unparsed', folderPath: folderPath };
  }

  return { kind: 'parsed', folderPath: folderPath, version: version.value };
}

function buildAliasTexts(texts: Record<string, string>): Record<string, NvmAliasFile> {
  return Object.fromEntries(
    Object.entries(texts).map(([name, text]) => [name, { kind: 'text', text: text }]),
  );
}

function buildFixtureState(params: {
  folderNames: string[];
  aliases?: Record<string, string>;
}): NvmState {
  return {
    kind: 'installed',
    versionFolders: params.folderNames.map((folderName) =>
      buildFixtureFolder({ folderName: folderName }),
    ),
    aliases: new Map(Object.entries(buildAliasTexts(params.aliases ?? {}))),
  };
}

function buildNvmrcPins(params: { texts: string[] }): ToolPins {
  return {
    kind: 'texts',
    files: params.texts.map((text, index) => ({
      path: buildTestAbsolutePath({ text: `/home/project${index}/.nvmrc` }),
      kind: 'nvmrc',
      text: text,
    })),
  };
}

function listOfferedVersions(offers: NvmVersionOffers): string[] {
  return offers.offers.map((offer) => offer.version);
}

describe('parseNvmNodeVersion', () => {
  test('passes a v<x.y.z> folder name and refuses any other', () => {
    expect(parseNvmNodeVersion({ folderName: 'v22.11.0' })).toEqual({
      kind: 'succeeded',
      value: buildTestNvmNodeVersion({ text: 'v22.11.0' }),
    });
    expect(parseNvmNodeVersion({ folderName: 'v22.0.0-nightly' }).kind).toBe('failed');
    expect(parseNvmNodeVersion({ folderName: '22.11.0' }).kind).toBe('failed');
    expect(parseNvmNodeVersion({ folderName: '--help' }).kind).toBe('failed');
  });
});

describe('parseNvmrcPin', () => {
  test('takes the one version line, without comments and edge spaces', () => {
    expect(parseNvmrcPin({ text: '22\n' })).toBe('22');
    expect(parseNvmrcPin({ text: '# the node of this project\n  v24.19 # newest\r\n\n' })).toBe(
      'v24.19',
    );
    expect(parseNvmrcPin({ text: '\tlts/iron\t' })).toBe('lts/iron');
  });

  test('ignores the key=value lines beside the version line', () => {
    expect(parseNvmrcPin({ text: 'lts/*\nlts=yes\nmirror = example\n' })).toBe('lts/*');
  });

  test('gives no pin for no version line, or two of them', () => {
    expect(parseNvmrcPin({ text: '' })).toBeNull();
    expect(parseNvmrcPin({ text: '  \n# only a comment\n' })).toBeNull();
    expect(parseNvmrcPin({ text: 'lts=yes\n' })).toBeNull();
    expect(parseNvmrcPin({ text: '22\n24\n' })).toBeNull();
  });

  test('counts a line that starts with = as a version line', () => {
    expect(parseNvmrcPin({ text: '22\n=x\n' })).toBeNull();
    expect(parseNvmrcPin({ text: '=x\n' })).toBe('=x');
  });

  test('gives no pin for a node= key or a key twice', () => {
    expect(parseNvmrcPin({ text: '22\nnode=20\n' })).toBeNull();
    expect(parseNvmrcPin({ text: '22\nlts=yes\nlts = no\n' })).toBeNull();
  });

  test('gives no pin for a control character other than a tab', () => {
    expect(parseNvmrcPin({ text: '2\u00072\n' })).toBeNull();
    expect(parseNvmrcPin({ text: '22\nkey=a\u001bb\n' })).toBeNull();
  });
});

describe('parseNvmAliasText', () => {
  test('takes the first line left after comments and blank lines, without trailing spaces', () => {
    expect(parseNvmAliasText({ text: 'v22.11.0\n' })).toBe('v22.11.0');
    expect(parseNvmAliasText({ text: '# set by hand\n\n   \nlts/iron  # the LTS\t\n' })).toBe(
      'lts/iron',
    );
    expect(parseNvmAliasText({ text: 'node\nv20.11.1\n' })).toBe('node');
  });

  test('gives null for no line left, or for flags before the target', () => {
    expect(parseNvmAliasText({ text: '' })).toBeNull();
    expect(parseNvmAliasText({ text: '# nothing\n\n' })).toBeNull();
    expect(parseNvmAliasText({ text: '--lts lts/*\n' })).toBeNull();
  });
});

describe('resolveNvmVersionPin', () => {
  const versions = [
    'v18.20.0',
    'v20.11.1',
    'v22.3.0',
    'v22.11.0',
    'v24.2.0',
    'v24.19.1',
    'v24.19.0',
  ].map((text) => buildTestNvmNodeVersion({ text: text }));

  function resolvePin(params: { pin: string; aliases?: Record<string, NvmAliasFile> }): unknown {
    return resolveNvmVersionPin({
      pin: params.pin,
      aliases: new Map(Object.entries(params.aliases ?? {})),
      versions: versions,
    });
  }

  function buildVersionResolution(text: string): unknown {
    return { kind: 'version', version: buildTestNvmNodeVersion({ text: text }) };
  }

  test('resolves a partial version to the newest installed one it matches', () => {
    expect(resolvePin({ pin: '22' })).toEqual(buildVersionResolution('v22.11.0'));
    expect(resolvePin({ pin: 'v24.19' })).toEqual(buildVersionResolution('v24.19.1'));
    expect(resolvePin({ pin: '24' })).toEqual(buildVersionResolution('v24.19.1'));
    expect(resolvePin({ pin: '20.11.1' })).toEqual(buildVersionResolution('v20.11.1'));
    expect(resolvePin({ pin: 'v22.3.0' })).toEqual(buildVersionResolution('v22.3.0'));
  });

  test('pins no folder for a version that matches none installed', () => {
    expect(resolvePin({ pin: '16' })).toEqual({ kind: 'noFolder' });
    expect(resolvePin({ pin: '2' })).toEqual({ kind: 'noFolder' });
    expect(resolvePin({ pin: 'v24.1' })).toEqual({ kind: 'noFolder' });
  });

  test('resolves node and stable to the newest installed version', () => {
    expect(resolvePin({ pin: 'node' })).toEqual(buildVersionResolution('v24.19.1'));
    expect(resolvePin({ pin: 'stable' })).toEqual(buildVersionResolution('v24.19.1'));
  });

  test('reads the alias file of a version or stable before the name itself', () => {
    expect(resolvePin({ pin: '20', aliases: buildAliasTexts({ '20': 'v18.20.0\n' }) })).toEqual(
      buildVersionResolution('v18.20.0'),
    );
    expect(resolvePin({ pin: 'stable', aliases: buildAliasTexts({ stable: '22\n' }) })).toEqual(
      buildVersionResolution('v22.11.0'),
    );
  });

  test('resolves node to the newest installed version even beside an alias file node', () => {
    expect(resolvePin({ pin: 'node', aliases: buildAliasTexts({ node: '20\n' }) })).toEqual(
      buildVersionResolution('v24.19.1'),
    );
  });

  test('pins no folder for system and iojs', () => {
    expect(resolvePin({ pin: 'system' })).toEqual({ kind: 'noFolder' });
    expect(resolvePin({ pin: 'iojs' })).toEqual({ kind: 'noFolder' });
  });

  test('resolves lts/* through its alias file and a chain of aliases', () => {
    const aliases = buildAliasTexts({
      'lts/*': 'lts/iron\n',
      'lts/iron': 'v20.11.1\n',
      work: 'mine',
      mine: 'lts/*',
    });

    expect(resolvePin({ pin: 'lts/*', aliases: aliases })).toEqual(
      buildVersionResolution('v20.11.1'),
    );
    expect(resolvePin({ pin: 'work', aliases: aliases })).toEqual(
      buildVersionResolution('v20.11.1'),
    );
  });

  test('pins no folder for an alias chain that ends in a version not installed', () => {
    expect(resolvePin({ pin: 'old', aliases: buildAliasTexts({ old: '16' }) })).toEqual({
      kind: 'noFolder',
    });
  });

  test('does not resolve an unknown name, a loop, or an alias with flags', () => {
    expect(resolvePin({ pin: 'hydrogen' })).toEqual({ kind: 'unresolved' });
    expect(resolvePin({ pin: 'a', aliases: buildAliasTexts({ a: 'b', b: 'a' }) })).toEqual({
      kind: 'unresolved',
    });
    expect(
      resolvePin({ pin: 'default', aliases: buildAliasTexts({ default: '--lts lts/*' }) }),
    ).toEqual({ kind: 'unresolved' });
    expect(
      resolvePin({
        pin: 'default',
        aliases: buildAliasTexts({ default: 'flagged', flagged: '--lts 22' }),
      }),
    ).toEqual({ kind: 'unresolved' });
  });

  test('does not resolve an unfit alias file or one with no target', () => {
    expect(resolvePin({ pin: 'default', aliases: { default: { kind: 'unfit' } } })).toEqual({
      kind: 'unresolved',
    });
    expect(
      resolvePin({ pin: 'default', aliases: buildAliasTexts({ default: '# empty' }) }),
    ).toEqual({ kind: 'unresolved' });
  });

  test('follows 8 hops and does not resolve 9', () => {
    function buildChain(hopCount: number): Record<string, NvmAliasFile> {
      const texts: Record<string, string> = {};

      for (let i = 1; i < hopCount; i++) {
        texts[`hop${i}`] = `hop${i + 1}`;
      }

      texts[`hop${hopCount}`] = '22';

      return buildAliasTexts(texts);
    }

    expect(resolvePin({ pin: 'hop1', aliases: buildChain(8) })).toEqual(
      buildVersionResolution('v22.11.0'),
    );
    expect(resolvePin({ pin: 'hop1', aliases: buildChain(9) })).toEqual({ kind: 'unresolved' });
  });
});

describe('decideNvmVersionOffers', () => {
  const folderNames = ['v20.11.1', 'v22.3.0', 'v22.11.0', 'v24.19.1'];

  test('offers each version neither the default nor any .nvmrc resolves to', () => {
    const offers = decideNvmVersionOffers({
      state: buildFixtureState({ folderNames: folderNames, aliases: { default: 'node' } }),
      toolPins: buildNvmrcPins({ texts: ['22\n', '16\n'] }),
    });

    expect(listOfferedVersions(offers)).toEqual(['v20.11.1', 'v22.3.0']);
    expect(offers.isComplete).toBe(true);
    expect(offers.defaultAlias).toEqual({
      kind: 'version',
      version: buildTestNvmNodeVersion({ text: 'v24.19.1' }),
    });
  });

  test('is fine without a default alias', () => {
    const offers = decideNvmVersionOffers({
      state: buildFixtureState({ folderNames: ['v20.11.1'] }),
      toolPins: buildNvmrcPins({ texts: [] }),
    });

    expect(listOfferedVersions(offers)).toEqual(['v20.11.1']);
    expect(offers.defaultAlias).toEqual({ kind: 'none' });
  });

  test('tells a default that names no installed folder', () => {
    const offers = decideNvmVersionOffers({
      state: buildFixtureState({ folderNames: ['v20.11.1'], aliases: { default: 'system' } }),
      toolPins: buildNvmrcPins({ texts: [] }),
    });

    expect(listOfferedVersions(offers)).toEqual(['v20.11.1']);
    expect(offers.defaultAlias).toEqual({ kind: 'noFolder' });
  });

  test('offers nothing and is judged when every version is pinned', () => {
    expect(
      decideNvmVersionOffers({
        state: buildFixtureState({ folderNames: folderNames }),
        toolPins: { kind: 'everyVersionPinned' },
      }),
    ).toEqual({ offers: [], isComplete: true, defaultAlias: { kind: 'none' } });
  });

  test('holds back every version when a pin or the default does not resolve', () => {
    for (const offers of [
      decideNvmVersionOffers({
        state: buildFixtureState({ folderNames: folderNames }),
        toolPins: buildNvmrcPins({ texts: ['22\n', 'hydrogen\n'] }),
      }),
      decideNvmVersionOffers({
        state: buildFixtureState({ folderNames: folderNames }),
        toolPins: buildNvmrcPins({ texts: ['22\n24\n'] }),
      }),
      decideNvmVersionOffers({
        state: buildFixtureState({ folderNames: folderNames, aliases: { default: '--lts 22' } }),
        toolPins: buildNvmrcPins({ texts: [] }),
      }),
    ]) {
      expect(offers.offers).toEqual([]);
      expect(offers.isComplete).toBe(false);
    }
  });

  test('holds back every version when the default alias file is unfit', () => {
    const state: NvmState = {
      kind: 'installed',
      versionFolders: [buildFixtureFolder({ folderName: 'v20.11.1' })],
      aliases: new Map([['default', { kind: 'unfit' }]]),
    };
    const offers = decideNvmVersionOffers({
      state: state,
      toolPins: buildNvmrcPins({ texts: [] }),
    });

    expect(offers.offers).toEqual([]);
    expect(offers.isComplete).toBe(false);
  });

  test('never offers a refused folder name and is not judged for it', () => {
    const offers = decideNvmVersionOffers({
      state: buildFixtureState({ folderNames: ['v20.11.1', 'v22.0.0-nightly'] }),
      toolPins: buildNvmrcPins({ texts: [] }),
    });

    expect(listOfferedVersions(offers)).toEqual(['v20.11.1']);
    expect(offers.isComplete).toBe(false);
  });

  test('judges no versions with no findings', () => {
    expect(
      decideNvmVersionOffers({
        state: { kind: 'noVersions' },
        toolPins: buildNvmrcPins({ texts: [] }),
      }),
    ).toEqual({ offers: [], isComplete: true, defaultAlias: { kind: 'none' } });
  });
});

describe('buildNvmVersionFindings', () => {
  const folderPath = buildTestAbsolutePath({ text: `${FIXTURE_VERSIONS_PATH}/v20.11.1` });
  const version = buildTestNvmNodeVersion({ text: 'v20.11.1' });
  const pinFiles: ProjectPinFileRef[] = [
    { path: buildTestAbsolutePath({ text: '/home/project/.nvmrc' }), kind: 'nvmrc' },
  ];

  function buildFindings(params: {
    offers: NvmVersionOffers;
    isWalkComplete: boolean;
    processCommands: string[] | null;
  }): ExploreProbeFindings {
    return buildNvmVersionFindings({
      offers: params.offers,
      pinFiles: pinFiles,
      projectPins: buildTestProjectPins({ files: [], isWalkComplete: params.isWalkComplete }),
      processCommands: params.processCommands,
    });
  }

  test('builds a careful unit with its pin files and the evidence of the default', () => {
    const built = buildFindings({
      offers: {
        offers: [{ kind: 'parsed', folderPath: folderPath, version: version }],
        isComplete: true,
        defaultAlias: {
          kind: 'version',
          version: buildTestNvmNodeVersion({ text: 'v24.19.1' }),
        },
      },
      isWalkComplete: true,
      processCommands: [],
    });

    expect(built).toEqual({
      findings: [
        {
          unit: {
            kind: 'nvmVersion',
            folderPath: folderPath,
            version: version,
            pinFiles: pinFiles,
          },
          title: 'nvm Node.js v20.11.1',
          explanation: expect.stringContaining(PINNED_VERSION_REINSTALL_EXPLANATION),
          regeneration: '`nvm install v20.11.1` installs it again.',
          risk: 'careful',
          evidenceLines: [
            'The default alias resolves to v24.19.1.',
            'None of the `.nvmrc` found (1) resolves to v20.11.1.',
          ],
          displayPath: folderPath,
          activity: 'idle',
        },
      ],
      isComplete: true,
    });
    expect(built.findings[0]?.explanation.endsWith(PINNED_VERSION_REINSTALL_EXPLANATION)).toBe(
      true,
    );
  });

  test('says which case of the default holds, and when the search was incomplete', () => {
    for (const [defaultAlias, line] of [
      [{ kind: 'none' }, 'There is no default alias.'],
      [{ kind: 'noFolder' }, 'The default alias resolves to no installed version.'],
    ] as const) {
      const built = buildFindings({
        offers: {
          offers: [{ kind: 'parsed', folderPath: folderPath, version: version }],
          isComplete: true,
          defaultAlias: defaultAlias,
        },
        isWalkComplete: false,
        processCommands: [],
      });

      expect(built.findings[0]?.evidenceLines).toEqual([
        line,
        'None of the `.nvmrc` found (1) resolves to v20.11.1.',
        PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
      ]);
    }
  });

  test('is busy while a process runs from the version folder, and unknown without processes', () => {
    const offers: NvmVersionOffers = {
      offers: [{ kind: 'parsed', folderPath: folderPath, version: version }],
      isComplete: true,
      defaultAlias: { kind: 'none' },
    };

    expect(
      buildFindings({
        offers: offers,
        isWalkComplete: true,
        processCommands: [`${folderPath}/bin/node server.js`],
      }).findings[0]?.activity,
    ).toBe('busy');
    expect(
      buildFindings({ offers: offers, isWalkComplete: true, processCommands: null }).findings[0]
        ?.activity,
    ).toBe('unknown');
  });
});

describe('compareNvmVersionUnit', () => {
  const state = buildFixtureState({ folderNames: ['v20.11.1', 'v22.11.0'] });
  const unit: ExplorePathUnitNvmVersion = {
    kind: 'nvmVersion',
    folderPath: buildTestAbsolutePath({ text: `${FIXTURE_VERSIONS_PATH}/v20.11.1` }),
    version: buildTestNvmNodeVersion({ text: 'v20.11.1' }),
    pinFiles: [],
  };

  test('answers unchanged while the unit is still offered and idle', () => {
    expect(
      compareNvmVersionUnit({
        unit: unit,
        state: state,
        toolPins: buildNvmrcPins({ texts: ['22'] }),
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('answers changed once a pin resolves to it or its folder is gone', () => {
    expect(
      compareNvmVersionUnit({
        unit: unit,
        state: state,
        toolPins: buildNvmrcPins({ texts: ['20'] }),
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
    expect(
      compareNvmVersionUnit({
        unit: unit,
        state: { kind: 'noVersions' },
        toolPins: buildNvmrcPins({ texts: [] }),
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while a process runs from its folder', () => {
    expect(
      compareNvmVersionUnit({
        unit: unit,
        state: state,
        toolPins: buildNvmrcPins({ texts: [] }),
        processCommands: [`${unit.folderPath}/bin/node`],
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('the nvm probe and recheck against a fixture home', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;
  let versionsPath: string;
  let aliasPath: string;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
    versionsPath = join(environment.homeDir, '.nvm', 'versions', 'node');
    aliasPath = join(environment.homeDir, '.nvm', 'alias');
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createVersionFolders(folderNames: string[]): Promise<void> {
    for (const folderName of folderNames) {
      await mkdir(join(versionsPath, folderName, 'bin'), { recursive: true });
    }
  }

  async function writeAlias(params: { name: string; text: string }): Promise<string> {
    const path = join(aliasPath, params.name);

    await writeFixtureTextFile({ path: path, text: params.text });

    return path;
  }

  async function writeNvmrc(params: { projectName: string; text: string }): Promise<string> {
    const path = join(environment.homeDir, params.projectName, '.nvmrc');

    await writeFixtureTextFile({ path: path, text: params.text });

    return path;
  }

  async function probeNvmVersions(projectPins: ProjectPinsLoad): Promise<unknown> {
    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({}),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      projectPins: projectPins,
      timeoutMs: 10_000,
      unusedCutoffMs: 0,
    });

    return probes.nvmVersions;
  }

  function buildVersionFolderPath(folderName: string): AbsolutePath {
    return buildTestAbsolutePath({ text: join(versionsPath, folderName) });
  }

  test('offers the versions neither the default alias nor a .nvmrc resolves to', async () => {
    await createVersionFolders(['v20.11.1', 'v22.11.0', 'v24.19.1']);
    await writeAlias({ name: 'default', text: 'lts/*\n' });
    await writeAlias({ name: 'lts/*', text: 'lts/iron\n' });
    await writeAlias({ name: 'lts/iron', text: 'v20.11.1\n' });
    const nvmrcPath = await writeNvmrc({ projectName: 'app', text: '22\n' });

    expect(
      await probeNvmVersions(
        buildFoundProjectPinsLoad({
          files: [buildTestPinFileText({ path: nvmrcPath, kind: 'nvmrc', text: '22\n' })],
        }),
      ),
    ).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: {
            kind: 'nvmVersion',
            folderPath: buildVersionFolderPath('v24.19.1'),
            version: buildTestNvmNodeVersion({ text: 'v24.19.1' }),
            pinFiles: [{ path: buildTestAbsolutePath({ text: nvmrcPath }), kind: 'nvmrc' }],
          },
          evidenceLines: [
            'The default alias resolves to v20.11.1.',
            'None of the `.nvmrc` found (1) resolves to v24.19.1.',
          ],
          activity: 'idle',
        }),
      ],
      isComplete: true,
    });
  });

  test('answers unreadable at an alias file it cannot read', async () => {
    await createVersionFolders(['v20.11.1']);
    const path = await writeAlias({ name: 'lts/iron', text: 'v20.11.1\n' });
    await chmod(path, 0o000);

    expect(await probeNvmVersions(buildEmptyProjectPinsLoad())).toEqual({
      kind: 'unreadable',
      path: path,
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });

  test('judges nothing while the default alias file is unfit', async () => {
    await createVersionFolders(['v20.11.1']);
    await mkdir(join(fixtureRoot.rootDir, 'elsewhere'));
    await mkdir(aliasPath, { recursive: true });
    await symlink(join(fixtureRoot.rootDir, 'elsewhere'), join(aliasPath, 'default'));

    expect(await probeNvmVersions(buildEmptyProjectPinsLoad())).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: false,
    });
  });

  test('answers unreadable at a .nvmrc the scan could not read', async () => {
    await createVersionFolders(['v20.11.1']);
    const pinFile = buildTestPinFileUnreadable({
      path: join(environment.homeDir, 'app', '.nvmrc'),
      kind: 'nvmrc',
    });

    expect(await probeNvmVersions(buildFoundProjectPinsLoad({ files: [pinFile] }))).toEqual({
      kind: 'unreadable',
      path: pinFile.path,
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });

  test('never offers a refused folder name and is not judged', async () => {
    await createVersionFolders(['v20.11.1', 'v22.0.0-nightly']);

    expect(await probeNvmVersions(buildEmptyProjectPinsLoad())).toEqual({
      kind: 'probed',
      findings: [
        expect.objectContaining({
          unit: expect.objectContaining({ folderPath: buildVersionFolderPath('v20.11.1') }),
        }),
      ],
      isComplete: false,
    });
  });

  test('judges a home without .nvm with no findings', async () => {
    expect(await probeNvmVersions(buildEmptyProjectPinsLoad())).toEqual({
      kind: 'probed',
      findings: [],
      isComplete: true,
    });
  });

  describe('recheckExplorePathUnit', () => {
    async function createUnit(params: { nvmrcText: string }): Promise<ExplorePathUnitNvmVersion> {
      await createVersionFolders(['v20.11.1', 'v22.11.0']);
      const nvmrcPath = await writeNvmrc({ projectName: 'app', text: params.nvmrcText });

      return {
        kind: 'nvmVersion',
        folderPath: buildVersionFolderPath('v20.11.1'),
        version: buildTestNvmNodeVersion({ text: 'v20.11.1' }),
        pinFiles: [{ path: buildTestAbsolutePath({ text: nvmrcPath }), kind: 'nvmrc' }],
      };
    }

    test('answers unchanged while the version is still offered and idle', async () => {
      const unit = await createUnit({ nvmrcText: '22\n' });

      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({ kind: 'unchanged' });
    });

    test('answers changed when the default alias now names the version', async () => {
      const unit = await createUnit({ nvmrcText: '22\n' });
      await writeAlias({ name: 'default', text: '20\n' });

      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    });

    test('answers changed when its pin file now resolves to the version', async () => {
      const unit = await createUnit({ nvmrcText: '22\n' });
      await writeNvmrc({ projectName: 'app', text: 'v20.11\n' });

      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    });

    test('answers busy while a process runs from the version folder', async () => {
      const unit = await createUnit({ nvmrcText: '22\n' });

      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          processCommands: [`${unit.folderPath}/bin/node server.js`],
        }),
      ).toEqual({ kind: 'busy' });
    });

    test('fails at an alias file it cannot read', async () => {
      const unit = await createUnit({ nvmrcText: '22\n' });
      const path = await writeAlias({ name: 'default', text: '22\n' });
      await chmod(path, 0o000);

      expect(
        await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
      ).toEqual({
        kind: 'failed',
        failure: {
          reason: 'fileUnreadable',
          path: path,
          failure: { reason: 'permissionDenied', code: 'EACCES' },
        },
      });
    });
  });
});
