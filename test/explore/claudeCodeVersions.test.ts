import { expect, test } from 'bun:test';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { loadClaudeCodeVersionFindings } from '../../src/explore/claudeCodeVersions/loadClaudeCodeVersionFindings.js';
import { recheckClaudeCodeVersionUnit } from '../../src/explore/claudeCodeVersions/recheckClaudeCodeVersionUnit.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type {
  ExplorePathUnitClaudeCodeVersion,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const NOW_MS = Date.now();

type VersionsFixture = { environment: Environment; versionsPath: string; launcherPath: string };

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withClaudeHome(params: {
  run: (fixture: VersionsFixture) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });

    await params.run({
      environment: environment,
      versionsPath: join(environment.homeDir, '.local', 'share', 'claude', 'versions'),
      launcherPath: join(environment.homeDir, '.local', 'bin', 'claude'),
    });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

function buildRun(params: {
  environment: Environment;
  processCommands: string[] | null;
}): ExploreProbeRun {
  return {
    environment: params.environment,
    platform: buildTestProbePlatform(),
    processCommands: params.processCommands,
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: 0,
    staleCutoffMs: 0,
  };
}

async function loadFindings(params: {
  environment: Environment;
  processCommands?: string[] | null;
}): Promise<ExploreProbeFindings> {
  const result = await loadClaudeCodeVersionFindings(
    buildRun({
      environment: params.environment,
      processCommands: params.processCommands === undefined ? [] : params.processCommands,
    }),
  );

  if (result.kind === 'failed') {
    throw new Error(`The probe failed: ${result.failure.reason}.`);
  }

  return result.value;
}

/**
 * Five versions, `2.1.0` a folder and the others executable files, a name that is no version, and
 * the launcher linked to `2.0.9`, older than the two newest.
 */
async function createVersions(fixture: VersionsFixture): Promise<void> {
  for (const version of ['2.0.1', '2.0.9', '2.1.3', '2.1.4', '2.1.30']) {
    await writeFixtureTextFile({ path: join(fixture.versionsPath, version), text: 'binary' });
  }

  await createFixtureDirectory({ path: join(fixture.versionsPath, '2.1.0') });
  await writeFixtureTextFile({ path: join(fixture.versionsPath, '2.1.5.tmp'), text: 'partial' });
  await linkLauncher({ fixture: fixture, version: '2.0.9' });
}

async function linkLauncher(params: { fixture: VersionsFixture; version: string }): Promise<void> {
  await createFixtureDirectory({ path: join(params.fixture.launcherPath, '..') });
  await rm(params.fixture.launcherPath, { force: true });
  await symlink(join(params.fixture.versionsPath, params.version), params.fixture.launcherPath);
}

function listUnits(findings: ExploreProbeFindings): ExplorePathUnitClaudeCodeVersion[] {
  return findings.findings.flatMap((finding) =>
    finding.unit.kind === 'claudeCodeVersion' ? [finding.unit] : [],
  );
}

describeAwaitingWin32Platform('loadClaudeCodeVersionFindings', () => {
  test("keeps the two newest versions and the launcher's, and offers the others as safe", async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);

        const probed = await loadFindings({ environment: fixture.environment });

        expect(probed.isComplete).toBe(true);
        expect(
          listUnits(probed)
            .map((unit) => unit.version)
            .toSorted(),
        ).toEqual(['2.0.1', '2.1.0', '2.1.3']);
        expect(
          listUnits(probed)
            .map((unit): string => unit.folderPath)
            .toSorted(),
        ).toEqual(
          ['2.0.1', '2.1.0', '2.1.3'].map((version) => join(fixture.versionsPath, version)),
        );
        expect(probed.findings.map((finding) => finding.risk)).toEqual(['safe', 'safe', 'safe']);
        expect(probed.findings.map((finding) => finding.activity)).toEqual([
          'idle',
          'idle',
          'idle',
        ]);
      },
    });
  });

  test('offers nothing and is incomplete without the launcher, or with one that leads elsewhere', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);
        await rm(fixture.launcherPath);

        expect(await loadFindings({ environment: fixture.environment })).toEqual({
          findings: [],
          isComplete: false,
        });

        await writeFixtureTextFile({ path: fixture.launcherPath, text: 'custom launcher' });

        expect(await loadFindings({ environment: fixture.environment })).toEqual({
          findings: [],
          isComplete: false,
        });
      },
    });
  });

  test('marks every version busy while a claude session runs', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);

        const probed = await loadFindings({
          environment: fixture.environment,
          processCommands: ['claude --continue'],
        });

        expect(probed.findings.map((finding) => finding.activity)).toEqual([
          'busy',
          'busy',
          'busy',
        ]);
      },
    });
  });

  test('finds nothing and is complete without the versions folder', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        expect(await loadFindings({ environment: fixture.environment })).toEqual({
          findings: [],
          isComplete: true,
        });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckClaudeCodeVersionUnit', () => {
  test('is unchanged while the version is still old and no claude runs', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);

        const [unit] = listUnits(await loadFindings({ environment: fixture.environment }));

        if (unit === undefined) {
          throw new Error('No version was offered.');
        }

        const recheck = (processCommands: string[] | null) =>
          recheckClaudeCodeVersionUnit({
            unit: unit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: processCommands,
          });

        expect(await recheck([])).toEqual({ kind: 'unchanged' });
        expect(await recheck(['/usr/local/bin/claude'])).toEqual({ kind: 'busy' });
        expect(await recheck(null)).toEqual({ kind: 'busy' });
      },
    });
  });

  test('is changed once the launcher runs the version', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);

        const unit = listUnits(await loadFindings({ environment: fixture.environment })).find(
          (candidate) => candidate.version === '2.1.3',
        );

        if (unit === undefined) {
          throw new Error('The version was not offered.');
        }

        await linkLauncher({ fixture: fixture, version: '2.1.3' });

        expect(
          await recheckClaudeCodeVersionUnit({
            unit: unit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: [],
          }),
        ).toEqual({ kind: 'changed' });
      },
    });
  });
});
