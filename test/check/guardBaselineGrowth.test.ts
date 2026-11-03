import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SuppressionBaseline } from '../../scripts/check/suppressionBaseline.js';
import { BOUNDARY_SUPPRESSIONS_PATH } from '../../scripts/check/suppressionBaseline.js';
import type { FixtureCommandRun } from '../support/fixtureCommand.js';
import { buildFixtureGitEnvironment, spawnFixtureCommand } from '../support/fixtureCommand.js';

/** A git repository in a folder of its own, beside the empty global config its git calls read. */
type BaselineRepository = { repositoryDir: string; gitEnvironment: Record<string, string> };

const guardPath = join(import.meta.dir, '../../scripts/check/guardBaselineGrowth.ts');
// Without the GIT_ variables of this process, no git call of a fixture reaches another repository.
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).flatMap(([name, value]): [string, string][] =>
    value === undefined || name.startsWith('GIT_') ? [] : [[name, value]],
  ),
);

/**
 * Runs `run` in a new repository under the temporary folder: one commit on `main` that holds
 * `baseBaseline` as the baseline file, or no baseline file for `null`, and the branch `change`
 * checked out from it. Removes the repository afterwards.
 */
async function withBaselineRepository(
  params: { baseBaseline: SuppressionBaseline | null },
  run: (repository: BaselineRepository) => Promise<void>,
): Promise<void> {
  const rootDir = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-baseline-'));

  try {
    const repository = await createBaselineRepository({
      rootDir: rootDir,
      baseBaseline: params.baseBaseline,
    });

    await run(repository);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function createBaselineRepository(params: {
  rootDir: string;
  baseBaseline: SuppressionBaseline | null;
}): Promise<BaselineRepository> {
  const repositoryDir = join(params.rootDir, 'repository');
  const globalConfigPath = join(params.rootDir, 'gitconfig');
  const repository: BaselineRepository = {
    repositoryDir: repositoryDir,
    gitEnvironment: buildFixtureGitEnvironment({
      baseEnvironment: inheritedEnvironment,
      globalConfigPath: globalConfigPath,
    }),
  };

  await mkdir(repositoryDir);
  // An empty file rather than /dev/null, which git on Windows cannot read as its global config.
  await writeFile(globalConfigPath, '');
  await runGit({ repository: repository, args: ['init', '--quiet', '--initial-branch=main'] });
  await writeFile(join(repositoryDir, 'README.md'), 'A fixture of the baseline growth guard.\n');

  if (params.baseBaseline !== null) {
    await writeBaseline({ repository: repository, baseline: params.baseBaseline });
  }

  await runGit({ repository: repository, args: ['add', '--all'] });
  await runGit({ repository: repository, args: ['commit', '--quiet', '--message', 'base'] });
  await runGit({ repository: repository, args: ['switch', '--quiet', '--create', 'change'] });

  return repository;
}

async function writeBaseline(params: {
  repository: BaselineRepository;
  baseline: SuppressionBaseline;
}): Promise<void> {
  await writeFile(
    join(params.repository.repositoryDir, BOUNDARY_SUPPRESSIONS_PATH),
    `${JSON.stringify(params.baseline, null, 2)}\n`,
  );
}

async function runGit(params: { repository: BaselineRepository; args: string[] }): Promise<void> {
  const run = await spawnFixtureCommand({
    command: ['git', ...params.args],
    workingDir: params.repository.repositoryDir,
    environment: params.repository.gitEnvironment,
    stdinText: null,
  });

  if (run.exitCode !== 0) {
    throw new Error(`git ${params.args.join(' ')} failed: ${run.stderrText}`);
  }
}

/** Writes `currentBaseline` into the working tree, unless `null`, and runs the guard on it. */
async function runGuard(params: {
  repository: BaselineRepository;
  baseRef: string;
  currentBaseline: SuppressionBaseline | null;
}): Promise<FixtureCommandRun> {
  if (params.currentBaseline !== null) {
    await writeBaseline({ repository: params.repository, baseline: params.currentBaseline });
  }

  return spawnFixtureCommand({
    command: [process.execPath, guardPath],
    workingDir: params.repository.repositoryDir,
    environment: { ...params.repository.gitEnvironment, BASELINE_BASE_REF: params.baseRef },
    stdinText: null,
  });
}

describe('the command guardBaselineGrowth.ts', () => {
  test('fails when the total of a rule rises against the base', async () => {
    const baseBaseline = { 'src/a.ts': { 'boundaries/edge': { count: 1 } } };

    await withBaselineRepository({ baseBaseline: baseBaseline }, async (repository) => {
      const run = await runGuard({
        repository: repository,
        baseRef: 'main',
        currentBaseline: { ...baseBaseline, 'src/b.ts': { 'boundaries/edge': { count: 1 } } },
      });

      expect(run.exitCode).toBe(1);
      expect(run.stderrText).toContain('\n  boundaries/edge: 2 in total, 1 at the base\n');
    });
  });

  test('fails when the count of a rule in one file rises, though its total holds', async () => {
    await withBaselineRepository(
      {
        baseBaseline: {
          'src/a.ts': { 'boundaries/edge': { count: 2 } },
          'src/b.ts': { 'boundaries/edge': { count: 1 } },
        },
      },
      async (repository) => {
        const run = await runGuard({
          repository: repository,
          baseRef: 'main',
          currentBaseline: {
            'src/a.ts': { 'boundaries/edge': { count: 1 } },
            'src/b.ts': { 'boundaries/edge': { count: 2 } },
          },
        });

        expect(run.exitCode).toBe(1);
        expect(run.stderrText).toMatch(
          /^error: boundary-suppressions\.json grew against its base [0-9a-f]{7} of main:\n {2}src\/b\.ts: 2 of boundaries\/edge, 1 at the base\nThe baseline may only shrink/,
        );
      },
    );
  });

  test('fails with the name of a base ref that names no commit', async () => {
    await withBaselineRepository({ baseBaseline: {} }, async (repository) => {
      const run = await runGuard({
        repository: repository,
        baseRef: 'origin/main',
        currentBaseline: null,
      });

      expect(run).toEqual({
        exitCode: 1,
        stdoutText: '',
        stderrText:
          'error: the base ref origin/main names no commit; fetch it, or set BASELINE_BASE_REF to the ref the change merges into\n',
      });
    });
  });

  test('fails when the base holds no baseline file and the change adds a count', async () => {
    await withBaselineRepository({ baseBaseline: null }, async (repository) => {
      const run = await runGuard({
        repository: repository,
        baseRef: 'main',
        currentBaseline: { 'src/a.ts': { 'boundaries/edge': { count: 1 } } },
      });

      expect(run.exitCode).toBe(1);
      expect(run.stderrText).toMatch(
        /^error: boundary-suppressions\.json grew against its base [0-9a-f]{7} of main:\n {2}boundaries\/edge: 1 in total, 0 at the base\n {2}src\/a\.ts: 1 of boundaries\/edge, 0 at the base\n/,
      );
    });
  });

  test('passes when the base holds no baseline file and the change adds an empty one', async () => {
    await withBaselineRepository({ baseBaseline: null }, async (repository) => {
      const run = await runGuard({
        repository: repository,
        baseRef: 'main',
        currentBaseline: {},
      });

      expect(run.exitCode).toBe(0);
      expect(run.stdoutText).toMatch(
        /^boundary-suppressions\.json did not grow against its base [0-9a-f]{7} of main\n$/,
      );
    });
  });

  test('passes when the baseline shrinks against the base', async () => {
    await withBaselineRepository(
      { baseBaseline: { 'src/a.ts': { 'boundaries/edge': { count: 2 } } } },
      async (repository) => {
        const run = await runGuard({
          repository: repository,
          baseRef: 'main',
          currentBaseline: { 'src/a.ts': { 'boundaries/edge': { count: 1 } } },
        });

        expect(run.exitCode).toBe(0);
        expect(run.stderrText).toBe('');
      },
    );
  });
});
