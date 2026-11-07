import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadCondaPackageFindings } from '../../src/explore/condaPackages/loadCondaPackageFindings.js';
import { parseCondaCleanDryRun } from '../../src/explore/condaPackages/parseCondaCleanDryRun.js';
import { recheckCondaUnit } from '../../src/explore/condaPackages/recheckCondaUnit.js';
import type { ExploreProbeToolRun } from '../../src/explore/exploreProbe.js';
import type { ExploreToolUnitCondaPackages } from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { createProbeFakeTool } from './probeFakeTools.js';

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
  /** A fake conda in the fixture's `bin` whose dry run would remove `tarballs` and `packages`. */
  async function createFakeConda(params: {
    home: FixtureHome;
    tarballs: string[];
    packages: string[];
  }): Promise<LocatedTool> {
    const path = await createProbeFakeTool({
      folder: join(params.home.fixtureRoot.rootDir, 'bin'),
      name: 'conda',
      answers: [
        {
          command: 'condaCleanDryRun',
          stdoutText: buildDryRunText({ tarballs: params.tarballs, packages: params.packages }),
          exitCode: 0,
        },
      ],
    });

    return { name: 'conda', path: path };
  }

  function buildRun(params: { home: FixtureHome; tool: LocatedTool }): ExploreProbeToolRun {
    return { ...buildTestProbeRun({ environment: params.home.environment }), tool: params.tool };
  }

  testOnPosix('offers the tarballs as safe and the packages as review', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const tool = await createFakeConda({
          home: home,
          tarballs: ['a-1-0.conda', 'b-2-0.tar.bz2'],
          packages: ['c-3-0'],
        });

        const findings = getProbeFindings(
          await loadCondaPackageFindings(buildRun({ home: home, tool: tool })),
        );

        expect(
          findings.findings.map((finding) => ({
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
      },
    });
  });

  testOnPosix('offers nothing when the clean would remove nothing', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const tool = await createFakeConda({ home: home, tarballs: [], packages: [] });

        expect(await loadCondaPackageFindings(buildRun({ home: home, tool: tool }))).toEqual({
          kind: 'succeeded',
          value: { findings: [], isComplete: true },
        });
      },
    });
  });

  testOnPosix('rechecks unchanged on a subset, changed on a new path, busy in a run', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        const tool = await createFakeConda({ home: home, tarballs: [], packages: ['c-3-0'] });
        const unit: ExploreToolUnitCondaPackages = {
          kind: 'condaPackages',
          tool: tool,
          packagePaths: [buildPkgsPath('c-3-0'), buildPkgsPath('d-4-0')],
        };
        const run = buildRun({ home: home, tool: tool });

        expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'unchanged' });
        expect(
          await recheckCondaUnit({
            unit: unit,
            run: { ...run, processCommands: ['/Users/example/miniforge3/bin/mamba install x'] },
          }),
        ).toEqual({ kind: 'busy' });

        await createFakeConda({ home: home, tarballs: [], packages: ['c-3-0', 'e-5-0'] });
        expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'changed' });

        await createFakeConda({ home: home, tarballs: [], packages: [] });
        expect(await recheckCondaUnit({ unit: unit, run: run })).toEqual({ kind: 'changed' });
      },
    });
  });
});
