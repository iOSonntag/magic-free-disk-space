import { describe, expect, test } from 'bun:test';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { compareClaudeCodeVersionUnit } from '../../src/explore/claudeCodeVersions/compareClaudeCodeVersionUnit.js';
import { decideClaudeCodeVersionOffers } from '../../src/explore/claudeCodeVersions/decideClaudeCodeVersionOffers.js';
import { loadClaudeCodeVersionFindings } from '../../src/explore/claudeCodeVersions/loadClaudeCodeVersionFindings.js';
import type {
  ClaudeCodeVersionEntry,
  ClaudeCodeVersionStateInstalled,
} from '../../src/explore/claudeCodeVersions/loadClaudeCodeVersionState.js';
import { recheckClaudeCodeVersionUnit } from '../../src/explore/claudeCodeVersions/recheckClaudeCodeVersionUnit.js';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import type { ExplorePathUnitClaudeCodeVersion } from '../../src/explore/exploreUnit.js';
import { createFixtureDirectory, writeFixtureTextFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { describeOnPosix, testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

const NOW_MS = Date.now();

const VALUE_VERSIONS_PATH = '/Users/example/.local/share/claude/versions';

type VersionsFixture = { environment: Environment; versionsPath: string; launcherPath: string };

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withClaudeHome(params: {
  run: (fixture: VersionsFixture) => Promise<void>;
}): Promise<void> {
  await withFixtureHome({
    nowMs: NOW_MS,
    run: async (home) => {
      await params.run({
        environment: home.environment,
        versionsPath: join(home.environment.homeDir, '.local', 'share', 'claude', 'versions'),
        launcherPath: join(home.environment.homeDir, '.local', 'bin', 'claude'),
      });
    },
  });
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

function buildValueEntry(version: string): ClaudeCodeVersionEntry {
  return {
    version: version,
    path: buildTestAbsolutePath({ text: `${VALUE_VERSIONS_PATH}/${version}` }),
  };
}

/** The installed versions `versions`, the launcher at `launcherVersion`. */
function buildValueState(params: {
  versions: string[];
  launcherVersion: string | null;
}): ClaudeCodeVersionStateInstalled {
  return {
    kind: 'installed',
    versions: params.versions.map(buildValueEntry),
    launcherVersion: params.launcherVersion,
  };
}

const VALUE_VERSIONS = ['2.0.1', '2.0.9', '2.1.0', '2.1.3', '2.1.4', '2.1.30'];

describe('decideClaudeCodeVersionOffers', () => {
  test("offers the versions past the two newest, newest first, but the launcher's", () => {
    expect(
      decideClaudeCodeVersionOffers({
        state: buildValueState({ versions: VALUE_VERSIONS, launcherVersion: '2.0.9' }),
      }),
    ).toEqual(['2.1.3', '2.1.0', '2.0.1'].map(buildValueEntry));
  });

  test('offers nothing while the two newest and the launcher are all there is', () => {
    expect(
      decideClaudeCodeVersionOffers({
        state: buildValueState({
          versions: ['2.0.9', '2.1.4', '2.1.30'],
          launcherVersion: '2.0.9',
        }),
      }),
    ).toEqual([]);
  });

  test("decides nothing without the launcher's version", () => {
    expect(
      decideClaudeCodeVersionOffers({
        state: buildValueState({ versions: VALUE_VERSIONS, launcherVersion: null }),
      }),
    ).toBeNull();
  });
});

describe('compareClaudeCodeVersionUnit', () => {
  const unit: ExplorePathUnitClaudeCodeVersion = {
    kind: 'claudeCodeVersion',
    version: '2.1.3',
    folderPath: buildValueEntry('2.1.3').path,
  };

  test('is unchanged while the version is still offered and no claude runs', () => {
    expect(
      compareClaudeCodeVersionUnit({
        unit: unit,
        state: buildValueState({ versions: VALUE_VERSIONS, launcherVersion: '2.0.9' }),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once the launcher runs it, the launcher is unknown, or no version is left', () => {
    for (const state of [
      buildValueState({ versions: VALUE_VERSIONS, launcherVersion: '2.1.3' }),
      buildValueState({ versions: VALUE_VERSIONS, launcherVersion: null }),
      { kind: 'noVersions' } as const,
    ]) {
      expect(
        compareClaudeCodeVersionUnit({
          unit: unit,
          state: state,
          runningProcesses: buildRunningCommandLines([]),
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('is busy while a claude session runs, or the processes are unknown', () => {
    for (const runningProcesses of [buildRunningCommandLines(['/usr/local/bin/claude']), null]) {
      expect(
        compareClaudeCodeVersionUnit({
          unit: unit,
          state: buildValueState({ versions: VALUE_VERSIONS, launcherVersion: '2.0.9' }),
          runningProcesses: runningProcesses,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

// A test that links the launcher runs on POSIX only, as the launcher is a symbolic link.
describe('loadClaudeCodeVersionFindings', () => {
  testOnPosix(
    "keeps the two newest versions and the launcher's, and offers the others as safe",
    async () => {
      await withClaudeHome({
        run: async (fixture) => {
          await createVersions(fixture);

          const probed = getProbeFindings(
            await loadClaudeCodeVersionFindings(
              buildTestProbeRun({ environment: fixture.environment }),
            ),
          );
          const units = listUnitsOfKind({ findings: probed, kind: 'claudeCodeVersion' });

          expect(probed.isComplete).toBe(true);
          expect(units.map((unit) => unit.version).toSorted()).toEqual(['2.0.1', '2.1.0', '2.1.3']);
          expect(units.map((unit): string => unit.folderPath).toSorted()).toEqual(
            ['2.0.1', '2.1.0', '2.1.3'].map((version) => join(fixture.versionsPath, version)),
          );
          expect(probed.findings.map((finding) => [finding.risk, finding.activity])).toEqual([
            ['safe', 'idle'],
            ['safe', 'idle'],
            ['safe', 'idle'],
          ]);

          const busy = getProbeFindings(
            await loadClaudeCodeVersionFindings(
              buildTestProbeRun({
                environment: fixture.environment,
                runningProcesses: buildRunningCommandLines(['claude --continue']),
              }),
            ),
          );

          expect(busy.findings.map((finding) => finding.activity)).toEqual([
            'busy',
            'busy',
            'busy',
          ]);
        },
      });
    },
  );

  testOnPosix(
    'offers nothing and is incomplete without the launcher, or with one that leads elsewhere',
    async () => {
      await withClaudeHome({
        run: async (fixture) => {
          await createVersions(fixture);
          await rm(fixture.launcherPath);

          const run = buildTestProbeRun({ environment: fixture.environment });

          expect(await loadClaudeCodeVersionFindings(run)).toEqual({
            kind: 'succeeded',
            value: { findings: [], isComplete: false },
          });

          await writeFixtureTextFile({ path: fixture.launcherPath, text: 'custom launcher' });

          expect(await loadClaudeCodeVersionFindings(run)).toEqual({
            kind: 'succeeded',
            value: { findings: [], isComplete: false },
          });
        },
      });
    },
  );

  test('finds nothing and is complete without the versions folder', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        expect(
          await loadClaudeCodeVersionFindings(
            buildTestProbeRun({ environment: fixture.environment }),
          ),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });
});

// The launcher is a symbolic link.
describeOnPosix('recheckClaudeCodeVersionUnit', () => {
  test('is unchanged while the version is still old, and changed once the launcher runs it', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createVersions(fixture);

        const unit = listUnitsOfKind({
          findings: getProbeFindings(
            await loadClaudeCodeVersionFindings(
              buildTestProbeRun({ environment: fixture.environment }),
            ),
          ),
          kind: 'claudeCodeVersion',
        }).find((candidate) => candidate.version === '2.1.3');

        if (unit === undefined) {
          throw new Error('The version was not offered.');
        }

        // A function declaration does not keep the narrowing of `unit`.
        const offeredUnit = unit;

        function recheck(): Promise<PathUnitRecheck> {
          return recheckClaudeCodeVersionUnit({
            unit: offeredUnit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            runningProcesses: buildRunningCommandLines([]),
          });
        }

        expect(await recheck()).toEqual({ kind: 'unchanged' });

        await linkLauncher({ fixture: fixture, version: '2.1.3' });

        expect(await recheck()).toEqual({ kind: 'changed' });
      },
    });
  });
});
