import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { loadClaudeTranscriptFindings } from '../../src/explore/claudeTranscripts/loadClaudeTranscriptFindings.js';
import { recheckClaudeTranscriptsUnit } from '../../src/explore/claudeTranscripts/recheckClaudeTranscriptsUnit.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExploreProbeFindings } from '../../src/explore/exploreUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const OLD_MS = NOW_MS - 40 * DAY_MS;

const RECENT_MS = NOW_MS - DAY_MS;

const PROJECT_FOLDER_NAME = '-Users-example-project';

type ProjectsFixture = { environment: Environment; projectPath: string };

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withClaudeHome(params: {
  run: (fixture: ProjectsFixture) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });

    await params.run({
      environment: environment,
      projectPath: join(environment.homeDir, '.claude', 'projects', PROJECT_FOLDER_NAME),
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
  const result = await loadClaudeTranscriptFindings(
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

async function writeEntry(params: { path: string; modifiedMs: number }): Promise<void> {
  await writeFixtureTextFile({ path: params.path, text: '{}\n' });
  await updateModifiedMs({ path: params.path, modifiedMs: params.modifiedMs });
}

/** A folder with one file inside, both last changed at `modifiedMs`. */
async function writeFolder(params: { path: string; modifiedMs: number }): Promise<void> {
  await writeEntry({ path: join(params.path, 'inner.jsonl'), modifiedMs: params.modifiedMs });
  await updateModifiedMs({ path: params.path, modifiedMs: params.modifiedMs });
}

/**
 * A project with two old sessions, one with its folder and a superseded copy, one only as an
 * orphaned copy; a session resumed yesterday; one whose folder changed yesterday; the memory
 * folder; a file and a folder no session names.
 */
async function createProject(fixture: ProjectsFixture): Promise<void> {
  const path = fixture.projectPath;

  await writeEntry({ path: join(path, 'old.jsonl'), modifiedMs: OLD_MS });
  await writeFolder({ path: join(path, 'old'), modifiedMs: OLD_MS });
  await writeEntry({ path: join(path, 'old.jsonl.superseded-1700000000'), modifiedMs: OLD_MS });
  await writeEntry({ path: join(path, 'lost.orphaned-1700000000-abc.jsonl'), modifiedMs: OLD_MS });
  await writeEntry({ path: join(path, 'resumed.jsonl'), modifiedMs: RECENT_MS });
  await writeEntry({ path: join(path, 'half.jsonl'), modifiedMs: OLD_MS });
  await writeFolder({ path: join(path, 'half'), modifiedMs: RECENT_MS });
  await writeFolder({ path: join(path, 'memory'), modifiedMs: OLD_MS });
  await writeEntry({ path: join(path, 'memory.jsonl'), modifiedMs: OLD_MS });
  await writeEntry({ path: join(path, 'notes.txt'), modifiedMs: OLD_MS });
  await writeFolder({ path: join(path, 'unnamed'), modifiedMs: OLD_MS });
  const recentProjectPath = join(
    fixture.environment.homeDir,
    '.claude',
    'projects',
    '-Users-example-recent',
  );

  await createFixtureDirectory({ path: recentProjectPath });
  await writeEntry({ path: join(recentProjectPath, 'new.jsonl'), modifiedMs: RECENT_MS });
}

describeAwaitingWin32Platform('loadClaudeTranscriptFindings', () => {
  test('offers the files and folders of the sessions untouched for 30 days, as careful', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const [finding] = probed.findings;

        expect(probed.isComplete).toBe(true);
        expect(probed.findings).toHaveLength(1);
        expect(finding?.risk).toBe('careful');
        expect(finding?.activity).toBe('idle');
        expect<unknown>(finding?.unit).toEqual({
          kind: 'claudeTranscripts',
          projectFolderPath: fixture.projectPath,
          cutoffMs: NOW_MS - 30 * DAY_MS,
          foundPaths: [
            join(fixture.projectPath, 'lost.orphaned-1700000000-abc.jsonl'),
            join(fixture.projectPath, 'old'),
            join(fixture.projectPath, 'old.jsonl'),
            join(fixture.projectPath, 'old.jsonl.superseded-1700000000'),
          ],
        });
        expect(finding?.evidenceLines[0]).toBe(
          '2 conversations of this project are untouched for 30 days.',
        );
      },
    });
  });

  test('never offers the memory folder, a resumed session, or what no session names', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const probed = await loadFindings({
          environment: fixture.environment,
          processCommands: null,
        });
        const unit = probed.findings[0]?.unit;
        const names =
          unit?.kind === 'claudeTranscripts'
            ? unit.foundPaths.map((path) => path.slice(fixture.projectPath.length + 1))
            : [];

        expect(names.filter((name) => /^(memory|resumed|half|notes|unnamed)/.test(name))).toEqual(
          [],
        );
        expect(probed.findings[0]?.activity).toBe('idle');
      },
    });
  });

  test('finds nothing and is complete without the projects folder', async () => {
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

describeAwaitingWin32Platform('recheckClaudeTranscriptsUnit', () => {
  test('is unchanged while the old sessions stay untouched', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const unit = (await loadFindings({ environment: fixture.environment })).findings[0]?.unit;

        if (unit?.kind !== 'claudeTranscripts') {
          throw new Error('The project was not offered.');
        }

        expect(
          await recheckClaudeTranscriptsUnit({
            unit: unit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: [],
          }),
        ).toEqual({ kind: 'unchanged' });
      },
    });
  });

  test('is changed once an old session is resumed', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const unit = (await loadFindings({ environment: fixture.environment })).findings[0]?.unit;

        if (unit?.kind !== 'claudeTranscripts') {
          throw new Error('The project was not offered.');
        }

        await updateModifiedMs({
          path: join(fixture.projectPath, 'old.jsonl'),
          modifiedMs: NOW_MS,
        });

        expect(
          await recheckClaudeTranscriptsUnit({
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
