import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreToolUnitHomebrewOldVersions,
  ExploreToolUnitHomebrewOrphans,
} from '../../src/explore/exploreUnit.js';
import { buildHomebrewFindings } from '../../src/explore/homebrew/buildHomebrewFindings.js';
import { buildHomebrewOldVersions } from '../../src/explore/homebrew/buildHomebrewOldVersions.js';
import type { HomebrewState } from '../../src/explore/homebrew/loadHomebrewState.js';
import { loadHomebrewState } from '../../src/explore/homebrew/loadHomebrewState.js';
import { parseHomebrewAutoremoveDryRun } from '../../src/explore/homebrew/parseHomebrewAutoremoveDryRun.js';
import { parseHomebrewCellarPath } from '../../src/explore/homebrew/parseHomebrewCellarPath.js';
import { parseHomebrewCleanupDryRun } from '../../src/explore/homebrew/parseHomebrewCleanupDryRun.js';
import {
  compareHomebrewUnit,
  recheckHomebrewUnit,
} from '../../src/explore/homebrew/recheckHomebrewUnit.js';
import { recheckExploreUnit } from '../../src/explore/recheckExploreUnit.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { ToolName } from '../../src/tools/toolInstallLocations.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestHomebrewFormulaName,
} from '../support/parsedValueFixtures.js';
import {
  APPLE_SILICON_CELLAR_PATH,
  buildHomebrewCleanupDryRunText,
  buildHomebrewKegPath,
  HOMEBREW_AUTOREMOVE_DRY_RUN_TEXT,
  INTEL_CELLAR_PATH,
} from './homebrewFixtures.js';
import type { ProbeFakeAnswer } from './probeFakeTools.js';
import { buildFixtureToolLocations, createProbeFakeTool } from './probeFakeTools.js';
import { FIXTURE_HOME_DIR } from './probeOutputFixtures.js';

const TIMEOUT_MS = 10_000;

const BREW_COMMAND =
  '/opt/homebrew/Library/Homebrew/vendor/portable-ruby/current/bin/ruby /opt/homebrew/Library/Homebrew/brew.rb install wget';

const brew: LocatedTool = { name: 'brewAppleSilicon', path: '/opt/homebrew/bin/brew' };

const wget = buildTestHomebrewFormulaName({ text: 'wget' });

const python = buildTestHomebrewFormulaName({ text: 'python@3.12' });

const libyaml = buildTestHomebrewFormulaName({ text: 'libyaml' });

const libfoo = buildTestHomebrewFormulaName({ text: 'libfoo' });

const olderWgetKegPath = buildHomebrewKegPath({
  cellarPath: APPLE_SILICON_CELLAR_PATH,
  formula: 'wget',
  version: '1.21.3',
});

const newerWgetKegPath = buildHomebrewKegPath({
  cellarPath: APPLE_SILICON_CELLAR_PATH,
  formula: 'wget',
  version: '1.21.4',
});

const libyamlKegPath = buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}/libyaml` });

const libfooKegPath = buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}/libfoo` });

const state: HomebrewState = {
  cellarPath: APPLE_SILICON_CELLAR_PATH,
  oldVersions: [
    {
      formula: wget,
      kegs: [
        { path: olderWgetKegPath, version: '1.21.3', sizeText: '4.2MB' },
        { path: newerWgetKegPath, version: '1.21.4', sizeText: '4.3MB' },
      ],
    },
  ],
  orphans: [
    { formula: libyaml, kegPath: libyamlKegPath },
    { formula: libfoo, kegPath: libfooKegPath },
  ],
};

const oldVersionsUnit: ExploreToolUnitHomebrewOldVersions = {
  kind: 'homebrewOldVersions',
  tool: brew,
  formula: wget,
  kegPaths: [olderWgetKegPath, newerWgetKegPath],
};

const orphansUnit: ExploreToolUnitHomebrewOrphans = {
  kind: 'homebrewOrphans',
  tool: brew,
  formulae: [libyaml, libfoo],
  kegPaths: [libyamlKegPath, libfooKegPath],
};

describe('parseHomebrewCellarPath', () => {
  test('reads the one path brew prints', () => {
    expect(parseHomebrewCellarPath({ stdoutText: '/opt/homebrew/Cellar\n' })).toEqual({
      kind: 'succeeded',
      value: APPLE_SILICON_CELLAR_PATH,
    });
  });

  test('rejects an empty, relative, or second path', () => {
    expect(parseHomebrewCellarPath({ stdoutText: '' }).kind).toBe('failed');
    expect(parseHomebrewCellarPath({ stdoutText: 'Cellar\n' }).kind).toBe('failed');
    expect(parseHomebrewCellarPath({ stdoutText: '/a/Cellar\n/b/Cellar\n' }).kind).toBe('failed');
  });
});

describe('parseHomebrewCleanupDryRun', () => {
  test('reads every Would remove line with its size, and skips the closing line', () => {
    const removals = parseHomebrewCleanupDryRun({
      stdoutText: buildHomebrewCleanupDryRunText({ homeDir: FIXTURE_HOME_DIR }),
    });

    if (removals.kind !== 'succeeded') {
      throw new Error('The dry run should parse.');
    }

    expect(removals.value).toHaveLength(8);
    expect(removals.value[0]?.sizeText).toBe('1.5MB');
    expect(removals.value[1]).toEqual({
      path: buildTestAbsolutePath({
        text: '/opt/homebrew/Library/Homebrew/vendor/portable-ruby/3.3.4',
      }),
      sizeText: '2,345 files, 45.1MB',
    });
  });

  test('reads a path with spaces and parentheses', () => {
    expect(parseHomebrewCleanupDryRun({ stdoutText: 'Would remove: /a b/c (1) (12KB)\n' })).toEqual(
      {
        kind: 'succeeded',
        value: [{ path: buildTestAbsolutePath({ text: '/a b/c (1)' }), sizeText: '12KB' }],
      },
    );
  });

  test('reads nothing from an empty output', () => {
    expect(parseHomebrewCleanupDryRun({ stdoutText: '' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('rejects a line with a relative path, no size, or a .. segment', () => {
    for (const line of [
      'Would remove: Cellar/wget/1.0 (1KB)',
      'Would remove: /opt/homebrew/Cellar/wget/1.0',
      'Would remove: /opt/homebrew/Cellar/../wget/1.0 (1KB)',
    ]) {
      expect(parseHomebrewCleanupDryRun({ stdoutText: line }).kind).toBe('failed');
    }
  });
});

describe('buildHomebrewOldVersions', () => {
  test('groups the kegs of its own Cellar by formula and ignores every other line', () => {
    const removals = parseHomebrewCleanupDryRun({
      stdoutText: buildHomebrewCleanupDryRunText({ homeDir: FIXTURE_HOME_DIR }),
    });

    if (removals.kind !== 'succeeded') {
      throw new Error('The dry run should parse.');
    }

    expect(
      buildHomebrewOldVersions({ cellarPath: INTEL_CELLAR_PATH, removals: removals.value }),
    ).toEqual({
      kind: 'succeeded',
      value: [
        {
          formula: wget,
          kegs: [
            {
              path: buildHomebrewKegPath({
                cellarPath: INTEL_CELLAR_PATH,
                formula: 'wget',
                version: '1.21.3',
              }),
              version: '1.21.3',
              sizeText: '91 files, 4.2MB',
            },
            {
              path: buildHomebrewKegPath({
                cellarPath: INTEL_CELLAR_PATH,
                formula: 'wget',
                version: '1.21.4',
              }),
              version: '1.21.4',
              sizeText: '92 files, 4.3MB',
            },
          ],
        },
        {
          formula: python,
          kegs: [
            {
              path: buildHomebrewKegPath({
                cellarPath: INTEL_CELLAR_PATH,
                formula: 'python@3.12',
                version: '3.12.1',
              }),
              version: '3.12.1',
              sizeText: '3,210 files, 65.4MB',
            },
          ],
        },
      ],
    });
  });

  test('ignores a Cellar line with no keg below its formula, and a sibling folder', () => {
    const removals = [
      { path: APPLE_SILICON_CELLAR_PATH, sizeText: '1KB' },
      {
        path: buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}/wget` }),
        sizeText: '1KB',
      },
      {
        path: buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}2/wget/1.0` }),
        sizeText: '1KB',
      },
    ];

    expect(
      buildHomebrewOldVersions({ cellarPath: APPLE_SILICON_CELLAR_PATH, removals: removals }),
    ).toEqual({ kind: 'succeeded', value: [] });
  });

  test('rejects a Cellar folder whose name could start an option', () => {
    const removals = [
      {
        path: buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}/--force/1.0` }),
        sizeText: '1KB',
      },
    ];

    expect(
      buildHomebrewOldVersions({ cellarPath: APPLE_SILICON_CELLAR_PATH, removals: removals }).kind,
    ).toBe('failed');
  });
});

describe('parseHomebrewAutoremoveDryRun', () => {
  test('reads each listed formula, a tap formula by its name', () => {
    expect(parseHomebrewAutoremoveDryRun({ stdoutText: HOMEBREW_AUTOREMOVE_DRY_RUN_TEXT })).toEqual(
      { kind: 'succeeded', value: [libyaml, libfoo] },
    );
    expect(
      parseHomebrewAutoremoveDryRun({
        stdoutText: '==> Would autoremove 1 unneeded formula:\nlibyaml\n',
      }),
    ).toEqual({ kind: 'succeeded', value: [libyaml] });
  });

  test('reads no formula from the empty output of nothing to remove', () => {
    expect(parseHomebrewAutoremoveDryRun({ stdoutText: '' })).toEqual({
      kind: 'succeeded',
      value: [],
    });
  });

  test('rejects a count that differs, no header, or a name that could start an option', () => {
    for (const stdoutText of [
      '==> Would autoremove 3 unneeded formulae:\nlibyaml\nlibfoo\n',
      'libyaml\n',
      '==> Would autoremove 1 unneeded formula:\n--force\n',
      '==> Would autoremove 1 unneeded formula:\ntools/libfoo\n',
    ]) {
      expect(parseHomebrewAutoremoveDryRun({ stdoutText: stdoutText }).kind).toBe('failed');
    }
  });
});

describe('buildHomebrewFindings', () => {
  test('offers each formula with old versions and the orphans together', () => {
    const findings = buildHomebrewFindings({ tool: brew, state: state, processCommands: [] });

    expect(findings.map((finding) => finding.unit)).toEqual([oldVersionsUnit, orphansUnit]);
    expect(findings[0]?.title).toBe('Homebrew wget 1.21.3, 1.21.4');
    expect(findings[0]?.evidenceLines).toEqual([
      '`brew cleanup -n` would remove wget 1.21.3 (4.2MB).',
      '`brew cleanup -n` would remove wget 1.21.4 (4.3MB).',
    ]);
    expect(findings[0]?.displayPath).toBe('/opt/homebrew/Cellar/wget');
    expect(findings[1]?.title).toBe('Homebrew orphans libyaml, libfoo');
    expect(findings[1]?.evidenceLines).toEqual([
      '`brew autoremove -n` would remove 2 formulae that no installed formula needs.',
      'libyaml at /opt/homebrew/Cellar/libyaml',
      'libfoo at /opt/homebrew/Cellar/libfoo',
    ]);
    expect(findings.map((finding) => [finding.risk, finding.activity])).toEqual([
      ['review', 'idle'],
      ['review', 'idle'],
    ]);
  });

  test('offers no orphans finding when autoremove lists none', () => {
    const findings = buildHomebrewFindings({
      tool: brew,
      state: { ...state, orphans: [] },
      processCommands: [],
    });

    expect(findings.map((finding) => finding.unit.kind)).toEqual(['homebrewOldVersions']);
  });

  test('is busy while another brew runs, and unknown when the processes are unread', () => {
    const busy = buildHomebrewFindings({
      tool: brew,
      state: state,
      processCommands: [BREW_COMMAND],
    });
    const unknown = buildHomebrewFindings({ tool: brew, state: state, processCommands: null });

    expect(busy.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
    expect(unknown.map((finding) => finding.activity)).toEqual(['unknown', 'unknown']);
  });
});

describe('compareHomebrewUnit', () => {
  test('is unchanged while the fresh kegs are a subset of the scanned ones and brew is idle', () => {
    const oneKegLeft: HomebrewState = {
      ...state,
      oldVersions: state.oldVersions.map((oldVersions) => ({
        ...oldVersions,
        kegs: oldVersions.kegs.slice(0, 1),
      })),
      orphans: state.orphans.slice(0, 1),
    };

    for (const unit of [oldVersionsUnit, orphansUnit]) {
      expect(compareHomebrewUnit({ unit: unit, state: state, processCommands: [] })).toEqual({
        kind: 'unchanged',
      });
      expect(compareHomebrewUnit({ unit: unit, state: oneKegLeft, processCommands: [] })).toEqual({
        kind: 'unchanged',
      });
    }
  });

  test('is changed for a keg the scan did not offer, or none left', () => {
    const newKegPath = buildTestAbsolutePath({ text: `${APPLE_SILICON_CELLAR_PATH}/wget/1.21.5` });
    const grown: HomebrewState = {
      ...state,
      oldVersions: [
        { formula: wget, kegs: [{ path: newKegPath, version: '1.21.5', sizeText: '' }] },
      ],
      orphans: [...state.orphans, { formula: python, kegPath: newKegPath }],
    };
    const emptied: HomebrewState = { ...state, oldVersions: [], orphans: [] };

    for (const unit of [oldVersionsUnit, orphansUnit]) {
      for (const fresh of [grown, emptied]) {
        expect(compareHomebrewUnit({ unit: unit, state: fresh, processCommands: [] })).toEqual({
          kind: 'changed',
        });
      }
    }
  });

  test('is busy while another brew runs or the processes are unread', () => {
    for (const processCommands of [[BREW_COMMAND], null]) {
      expect(
        compareHomebrewUnit({
          unit: oldVersionsUnit,
          state: state,
          processCommands: processCommands,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

describe('with fake brews', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildWorkingAnswers(params: { cellarPath: string }): ProbeFakeAnswer[] {
    return [
      { command: 'homebrewCellar', stdoutText: `${params.cellarPath}\n`, exitCode: 0 },
      {
        command: 'homebrewCleanup',
        stdoutText: buildHomebrewCleanupDryRunText({ homeDir: environment.homeDir }),
        exitCode: 0,
      },
      { command: 'homebrewAutoremove', stdoutText: HOMEBREW_AUTOREMOVE_DRY_RUN_TEXT, exitCode: 0 },
    ];
  }

  async function createBrew(params: {
    name: ToolName;
    answers: ProbeFakeAnswer[];
  }): Promise<LocatedTool> {
    const path = await createProbeFakeTool({
      folder: join(fixtureRoot.rootDir, params.name),
      name: params.name,
      answers: params.answers,
    });

    return { name: params.name, path: path };
  }

  test('runs both probes, each judging only the Cellar of its own brew', async () => {
    const appleSilicon = await createBrew({
      name: 'brewAppleSilicon',
      answers: buildWorkingAnswers({ cellarPath: APPLE_SILICON_CELLAR_PATH }),
    });
    const intel = await createBrew({
      name: 'brewIntel',
      answers: buildWorkingAnswers({ cellarPath: INTEL_CELLAR_PATH }),
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({
        brewAppleSilicon: appleSilicon.path,
        brewIntel: intel.path,
      }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: 0,
    });
    const appleSiliconOutcome = await probes.homebrewAppleSilicon;
    const intelOutcome = await probes.homebrewIntel;

    if (appleSiliconOutcome.kind !== 'probed' || intelOutcome.kind !== 'probed') {
      throw new Error('Both Homebrew probes should have run.');
    }

    expect(appleSiliconOutcome.isComplete).toBe(true);
    expect(intelOutcome.isComplete).toBe(true);
    expect(appleSiliconOutcome.findings.map((finding) => finding.displayPath)).toEqual([
      '/opt/homebrew/Cellar/wget',
      '/opt/homebrew/Cellar/python@3.12',
      '/opt/homebrew/Cellar',
    ]);
    expect(intelOutcome.findings.map((finding) => finding.displayPath)).toEqual([
      '/usr/local/Cellar/wget',
      '/usr/local/Cellar/python@3.12',
      '/usr/local/Cellar',
    ]);
    expect(intelOutcome.findings[0]?.unit).toMatchObject({
      tool: { name: 'brewIntel', path: await realpath(intel.path) },
    });
  });

  test('fails the probe of a brew that will not run', async () => {
    const intel = await createBrew({
      name: 'brewIntel',
      answers: [{ command: 'homebrewCellar', stdoutText: '', exitCode: 1 }],
    });

    const probes = startExploreProbes({
      environment: environment,
      toolInstallLocations: buildFixtureToolLocations({ brewIntel: intel.path }),
      processCommands: Promise.resolve([]),
      activeXcodeBundlePath: Promise.resolve(null),
      timeoutMs: TIMEOUT_MS,
      unusedCutoffMs: 0,
    });
    const outcome = await probes.homebrewIntel;

    expect(outcome.kind === 'failed' && outcome.failure).toEqual({
      reason: 'commandFailed',
      failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: 'a line on stderr\n' },
    });
  });

  test('fails the state on a failed or unreadable command', async () => {
    const failing = await createBrew({
      name: 'brewAppleSilicon',
      answers: [
        { command: 'homebrewCellar', stdoutText: `${APPLE_SILICON_CELLAR_PATH}\n`, exitCode: 0 },
        { command: 'homebrewCleanup', stdoutText: '', exitCode: 1 },
      ],
    });
    const failed = await loadHomebrewState({
      tool: failing,
      environment: environment,
      deadlineMs: Date.now() + TIMEOUT_MS,
    });

    expect(failed.kind === 'failed' && failed.failure.reason).toBe('commandFailed');

    const garbled = await createBrew({
      name: 'brewIntel',
      answers: [
        ...buildWorkingAnswers({ cellarPath: INTEL_CELLAR_PATH }).slice(0, 2),
        { command: 'homebrewAutoremove', stdoutText: 'garbage\n', exitCode: 0 },
      ],
    });
    const recheck = await recheckHomebrewUnit({
      unit: { ...orphansUnit, tool: garbled },
      run: {
        tool: garbled,
        environment: environment,
        deadlineMs: Date.now() + TIMEOUT_MS,
        processCommands: [],
      },
    });

    expect(recheck.kind === 'failed' && recheck.failure.reason).toBe('outputUnreadable');
  });

  test('rechecks each unit kind through recheckExploreUnit', async () => {
    const tool = await createBrew({
      name: 'brewAppleSilicon',
      answers: buildWorkingAnswers({ cellarPath: APPLE_SILICON_CELLAR_PATH }),
    });
    const recheck = {
      tool: tool,
      environment: environment,
      processCommands: [],
      timeoutMs: TIMEOUT_MS,
    };

    expect(
      await recheckExploreUnit({ ...recheck, unit: { ...oldVersionsUnit, tool: tool } }),
    ).toEqual({ kind: 'unchanged' });
    expect(
      await recheckExploreUnit({
        ...recheck,
        unit: { ...orphansUnit, tool: tool },
        processCommands: [BREW_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      await recheckExploreUnit({
        ...recheck,
        unit: { ...orphansUnit, tool: tool, kegPaths: [libyamlKegPath] },
      }),
    ).toEqual({ kind: 'changed' });
  });
});
