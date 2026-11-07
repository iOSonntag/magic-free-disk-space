import { afterEach, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { loadCondaPackageFindings } from '../../src/explore/condaPackages/loadCondaPackageFindings.js';
import { parseCondaCleanDryRun } from '../../src/explore/condaPackages/parseCondaCleanDryRun.js';
import { recheckCondaUnit } from '../../src/explore/condaPackages/recheckCondaUnit.js';
import type { ExploreProbeToolRun } from '../../src/explore/exploreProbe.js';
import type { ExploreToolUnitCondaPackages } from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const PKGS_DIR = '/Users/example/miniconda3/pkgs';

function buildPkgsPath(name: string): AbsolutePath {
  return buildTestAbsolutePath({ text: `${PKGS_DIR}/${name}` });
}

function buildDryRunText(params: { tarballs: string[]; packages: string[] }): string {
  return JSON.stringify(
    {
      success: true,
      tarballs: {
        pkgs_dirs: { [PKGS_DIR]: params.tarballs },
        pkg_sizes: {},
        total_size: 0,
        warnings: [],
      },
      packages: { pkgs_dirs: { [PKGS_DIR]: params.packages }, total_size: 0, warnings: [] },
    },
    null,
    2,
  );
}

describeAwaitingWin32Platform('parseCondaCleanDryRun', () => {
  test('joins each listed name to its package folder', () => {
    expect(
      parseCondaCleanDryRun({
        pathRules: DARWIN_PATH_RULES,
        stdoutText: buildDryRunText({
          tarballs: ['numpy-1.26.0-py311.conda'],
          packages: ['numpy-1.25.0-py311'],
        }),
      }),
    ).toEqual({
      kind: 'succeeded',
      value: {
        tarballPaths: [buildPkgsPath('numpy-1.26.0-py311.conda')],
        packagePaths: [buildPkgsPath('numpy-1.25.0-py311')],
      },
    });
  });

  test('reads the plan when a second JSON object follows it', () => {
    const stdoutText = `${buildDryRunText({ tarballs: [], packages: ['a-1-0'] })}\n{\n  "message": "Dry run. Exiting."\n}\n`;

    expect(parseCondaCleanDryRun({ pathRules: DARWIN_PATH_RULES, stdoutText: stdoutText })).toEqual(
      {
        kind: 'succeeded',
        value: { tarballPaths: [], packagePaths: [buildPkgsPath('a-1-0')] },
      },
    );
  });

  test('fails on other text, a relative folder, or a name with a separator', () => {
    const stdoutTexts = [
      'not json',
      '{"tarballs": {}}',
      JSON.stringify({ tarballs: { pkgs_dirs: { pkgs: [] } }, packages: { pkgs_dirs: {} } }),
      buildDryRunText({ tarballs: ['../escape'], packages: [] }),
      buildDryRunText({ tarballs: ['a/b'], packages: [] }),
    ];

    for (const stdoutText of stdoutTexts) {
      expect(
        parseCondaCleanDryRun({ pathRules: DARWIN_PATH_RULES, stdoutText: stdoutText }).kind,
      ).toBe('failed');
    }
  });
});

describeAwaitingWin32Platform('loadCondaPackageFindings and recheckCondaUnit', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;
  let answerPath: string;
  let tool: LocatedTool;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
    const folder = join(fixtureRoot.rootDir, 'bin');
    answerPath = join(folder, 'dry-run.json');
    const path = await createFakeTool({
      folder: folder,
      name: 'conda',
      body: `import * as fs from 'node:fs';

if (process.argv.slice(2).join(' ') !== 'clean --tarballs --packages --dry-run --json') {
  process.exit(64);
}

fs.writeSync(1, fs.readFileSync(${JSON.stringify(answerPath)}));
process.exit(0);`,
    });
    tool = { name: 'conda', path: path };
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildRun(): ExploreProbeToolRun {
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

  async function writeAnswer(params: { tarballs: string[]; packages: string[] }) {
    await writeFixtureTextFile({ path: answerPath, text: buildDryRunText(params) });
  }

  testOnPosix('offers the tarballs as safe and the packages as review', async () => {
    await writeAnswer({ tarballs: ['a-1-0.conda', 'b-2-0.tar.bz2'], packages: ['c-3-0'] });

    const result = await loadCondaPackageFindings(buildRun());

    if (result.kind === 'failed') {
      throw new Error('The conda probe failed.');
    }

    expect(
      result.value.findings.map((finding) => ({
        unit: finding.unit,
        risk: finding.risk,
        displayPath: finding.displayPath,
      })),
    ).toEqual([
      {
        unit: {
          kind: 'condaTarballs',
          tool: tool,
          tarballPaths: [buildPkgsPath('a-1-0.conda'), buildPkgsPath('b-2-0.tar.bz2')],
        },
        risk: 'safe',
        displayPath: PKGS_DIR,
      },
      {
        unit: { kind: 'condaPackages', tool: tool, packagePaths: [buildPkgsPath('c-3-0')] },
        risk: 'review',
        displayPath: PKGS_DIR,
      },
    ]);
  });

  testOnPosix('offers nothing when the clean would remove nothing', async () => {
    await writeAnswer({ tarballs: [], packages: [] });

    expect(await loadCondaPackageFindings(buildRun())).toEqual({
      kind: 'succeeded',
      value: { findings: [], isComplete: true },
    });
  });

  testOnPosix('rechecks unchanged on a subset, changed on a new path, busy in a run', async () => {
    const unit: ExploreToolUnitCondaPackages = {
      kind: 'condaPackages',
      tool: tool,
      packagePaths: [buildPkgsPath('c-3-0'), buildPkgsPath('d-4-0')],
    };
    const run = buildRun();

    await writeAnswer({ tarballs: [], packages: ['c-3-0'] });
    expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'unchanged' });
    expect(
      await recheckCondaUnit({
        unit: unit,
        run: { ...run, processCommands: ['/Users/example/miniconda3/bin/conda install x'] },
      }),
    ).toEqual({ kind: 'busy' });

    await writeAnswer({ tarballs: [], packages: ['c-3-0', 'e-5-0'] });
    expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'changed' });

    await writeAnswer({ tarballs: [], packages: [] });
    expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'changed' });
  });
});
