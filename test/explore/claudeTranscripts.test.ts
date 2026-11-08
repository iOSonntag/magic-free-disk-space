import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { compareClaudeTranscriptsUnit } from '../../src/explore/claudeTranscripts/compareClaudeTranscriptsUnit.js';
import {
  CLAUDE_TRANSCRIPT_UNTOUCHED_MS,
  decideOldTranscriptPaths,
} from '../../src/explore/claudeTranscripts/decideOldTranscriptPaths.js';
import type {
  ClaudeProjectEntry,
  ClaudeProjectState,
} from '../../src/explore/claudeTranscripts/loadClaudeProjectsState.js';
import { loadClaudeTranscriptFindings } from '../../src/explore/claudeTranscripts/loadClaudeTranscriptFindings.js';
import { recheckClaudeTranscriptsUnit } from '../../src/explore/claudeTranscripts/recheckClaudeTranscriptsUnit.js';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import type {
  ExploreFoundPaths,
  ExplorePathUnitClaudeTranscripts,
} from '../../src/explore/exploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { DAY_MS } from '../../src/scan/limits.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { updateModifiedMs, writeFixtureTextFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  getUnitOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const OLD_MS = NOW_MS - 40 * DAY_MS;

const RECENT_MS = NOW_MS - DAY_MS;

const CUTOFF_MS = NOW_MS - CLAUDE_TRANSCRIPT_UNTOUCHED_MS;

const PROJECT_FOLDER_NAME = '-Users-example-project';

const VALUE_PROJECT_PATH = `/Users/example/.claude/projects/${PROJECT_FOLDER_NAME}`;

type ProjectsFixture = { environment: Environment; projectPath: string };

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withClaudeHome(params: {
  run: (fixture: ProjectsFixture) => Promise<void>;
}): Promise<void> {
  await withFixtureHome({
    nowMs: NOW_MS,
    run: async (home) => {
      await params.run({
        environment: home.environment,
        projectPath: join(home.environment.homeDir, '.claude', 'projects', PROJECT_FOLDER_NAME),
      });
    },
  });
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

  await writeEntry({ path: join(recentProjectPath, 'new.jsonl'), modifiedMs: RECENT_MS });
}

function buildValuePath(name: string): AbsolutePath {
  return buildTestAbsolutePath({ text: `${VALUE_PROJECT_PATH}/${name}` });
}

function buildValueEntry(params: {
  name: string;
  kind: 'file' | 'directory';
  modifiedMs: number;
}): ClaudeProjectEntry {
  return {
    name: params.name,
    path: buildValuePath(params.name),
    kind: params.kind,
    modifiedMs: params.modifiedMs,
  };
}

/** The entries `createProject` writes into its project, as values. */
const VALUE_ENTRIES: ClaudeProjectEntry[] = [
  buildValueEntry({ name: 'old.jsonl', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'old', kind: 'directory', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'old.jsonl.superseded-1700000000', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'lost.orphaned-1700000000-abc.jsonl', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'resumed.jsonl', kind: 'file', modifiedMs: RECENT_MS }),
  buildValueEntry({ name: 'half.jsonl', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'half', kind: 'directory', modifiedMs: RECENT_MS }),
  buildValueEntry({ name: 'memory', kind: 'directory', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'memory.jsonl', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'notes.txt', kind: 'file', modifiedMs: OLD_MS }),
  buildValueEntry({ name: 'unnamed', kind: 'directory', modifiedMs: OLD_MS }),
];

const OLD_PATHS: ExploreFoundPaths = [
  buildValuePath('lost.orphaned-1700000000-abc.jsonl'),
  buildValuePath('old'),
  buildValuePath('old.jsonl'),
  buildValuePath('old.jsonl.superseded-1700000000'),
];

function buildValueProject(entries: ClaudeProjectEntry[]): ClaudeProjectState {
  return {
    folderName: PROJECT_FOLDER_NAME,
    path: buildTestAbsolutePath({ text: VALUE_PROJECT_PATH }),
    entries: entries,
  };
}

describeAwaitingWin32Platform('decideOldTranscriptPaths', () => {
  test('takes each session whose files and own folder are all older than the cutoff', () => {
    expect(
      decideOldTranscriptPaths({ project: buildValueProject(VALUE_ENTRIES), cutoffMs: CUTOFF_MS }),
    ).toEqual({ sessionCount: 2, paths: OLD_PATHS });
  });

  test('keeps a session touched right at the cutoff', () => {
    expect(
      decideOldTranscriptPaths({
        project: buildValueProject([
          buildValueEntry({ name: 'edge.jsonl', kind: 'file', modifiedMs: CUTOFF_MS }),
        ]),
        cutoffMs: CUTOFF_MS,
      }),
    ).toEqual({ sessionCount: 0, paths: [] });
  });
});

describeAwaitingWin32Platform('compareClaudeTranscriptsUnit', () => {
  const unit: ExplorePathUnitClaudeTranscripts = {
    kind: 'claudeTranscripts',
    projectFolderPath: buildTestAbsolutePath({ text: VALUE_PROJECT_PATH }),
    cutoffMs: CUTOFF_MS,
    foundPaths: OLD_PATHS,
  };

  test("is unchanged while the old sessions are exactly the unit's, whatever the processes", () => {
    for (const processCommands of [[], null]) {
      expect(
        compareClaudeTranscriptsUnit({
          unit: unit,
          project: buildValueProject(VALUE_ENTRIES),
          processCommands: processCommands,
        }),
      ).toEqual({ kind: 'unchanged' });
    }
  });

  test('is changed once a session is resumed, another grows old, or the project is gone', () => {
    const resumed = VALUE_ENTRIES.map((entry) =>
      entry.name === 'old.jsonl' ? { ...entry, modifiedMs: NOW_MS } : entry,
    );
    const grownOld = VALUE_ENTRIES.map((entry) =>
      entry.name === 'resumed.jsonl' ? { ...entry, modifiedMs: OLD_MS } : entry,
    );

    for (const project of [buildValueProject(resumed), buildValueProject(grownOld), null]) {
      expect(
        compareClaudeTranscriptsUnit({ unit: unit, project: project, processCommands: [] }),
      ).toEqual({ kind: 'changed' });
    }
  });
});

describeAwaitingWin32Platform('loadClaudeTranscriptFindings', () => {
  test('offers the files and folders of the sessions untouched for 30 days, as careful', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const probed = getProbeFindings(
          await loadClaudeTranscriptFindings(
            buildTestProbeRun({ environment: fixture.environment }),
          ),
        );
        const [finding] = probed.findings;

        expect(probed.isComplete).toBe(true);
        expect(probed.findings).toHaveLength(1);
        expect(finding?.risk).toBe('careful');
        expect(finding?.activity).toBe('idle');
        expect<unknown>(finding?.unit).toEqual({
          kind: 'claudeTranscripts',
          projectFolderPath: fixture.projectPath,
          cutoffMs: CUTOFF_MS,
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

  test('stays idle when the processes are unknown', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const probed = getProbeFindings(
          await loadClaudeTranscriptFindings(
            buildTestProbeRun({ environment: fixture.environment, processCommands: null }),
          ),
        );

        expect(probed.findings.map((finding) => finding.activity)).toEqual(['idle']);
      },
    });
  });

  test('finds nothing and is complete without the projects folder', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        expect(
          await loadClaudeTranscriptFindings(
            buildTestProbeRun({ environment: fixture.environment }),
          ),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckClaudeTranscriptsUnit', () => {
  test('is unchanged while the old sessions stay untouched, and changed once one is resumed', async () => {
    await withClaudeHome({
      run: async (fixture) => {
        await createProject(fixture);

        const unit = getUnitOfKind({
          findings: getProbeFindings(
            await loadClaudeTranscriptFindings(
              buildTestProbeRun({ environment: fixture.environment }),
            ),
          ),
          kind: 'claudeTranscripts',
        });
        function recheck(): Promise<PathUnitRecheck> {
          return recheckClaudeTranscriptsUnit({
            unit: unit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: [],
          });
        }

        expect(await recheck()).toEqual({ kind: 'unchanged' });

        await updateModifiedMs({
          path: join(fixture.projectPath, 'old.jsonl'),
          modifiedMs: NOW_MS,
        });

        expect(await recheck()).toEqual({ kind: 'changed' });
      },
    });
  });
});
