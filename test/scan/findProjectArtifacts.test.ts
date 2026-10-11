import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ARTIFACT_RULES } from '../../src/catalog/projectArtifactRules.js';
import { findProjectArtifacts } from '../../src/scan/findProjectArtifacts.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

const NO_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

async function createEmptyFile(params: { path: string }): Promise<void> {
  await createFixtureFile({ path: params.path, sizeBytes: 0, modifiedMs: Date.now() });
}

describe('findProjectArtifacts', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('finds node_modules beside its package.json', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    const artifactPath = join(projectPath, 'node_modules');
    await createFixtureDirectory({ path: artifactPath });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result).toEqual({
      findings: [
        {
          artifactPath: artifactPath,
          projectRoot: projectPath,
          rule: expect.objectContaining({ artifactName: 'node_modules' }),
        },
      ],
      issues: [],
    });
  });

  test('does not report node_modules without a marker file', async () => {
    await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'app', 'node_modules') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('does not report an artifact nested inside a found artifact', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({
      path: join(projectPath, 'node_modules', 'dependency', 'node_modules'),
    });
    await createEmptyFile({ path: join(projectPath, 'package.json') });
    await createEmptyFile({
      path: join(projectPath, 'node_modules', 'dependency', 'package.json'),
    });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
    expect(result.issues).toEqual([]);
  });

  test('finds .venv beside pyproject.toml and skips other hidden folders', async () => {
    const pythonPath = join(fixtureRoot.homeDir, 'python-service');
    await createFixtureDirectory({ path: join(pythonPath, '.venv') });
    await createEmptyFile({ path: join(pythonPath, 'pyproject.toml') });

    const hiddenPath = join(fixtureRoot.homeDir, '.hidden-tools');
    await createFixtureDirectory({ path: join(hiddenPath, 'node_modules') });
    await createEmptyFile({ path: join(hiddenPath, 'package.json') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.artifactPath)).toEqual([
      join(pythonPath, '.venv'),
    ]);
    expect(result.issues).toEqual([]);
  });

  test('skips an excluded top name only at the top level', async () => {
    const topLibraryProjectPath = join(fixtureRoot.homeDir, 'Library', 'app');
    const nestedLibraryProjectPath = join(fixtureRoot.homeDir, 'dev', 'Library', 'app');
    await createFixtureDirectory({ path: join(topLibraryProjectPath, 'node_modules') });
    await createEmptyFile({ path: join(topLibraryProjectPath, 'package.json') });
    await createFixtureDirectory({ path: join(nestedLibraryProjectPath, 'node_modules') });
    await createEmptyFile({ path: join(nestedLibraryProjectPath, 'package.json') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: ['Library'],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.artifactPath)).toEqual([
      join(nestedLibraryProjectPath, 'node_modules'),
    ]);
  });

  test('does not find an artifact deeper than maxDepth, but finds one at maxDepth', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'work', 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const tooShallow = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 2,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(tooShallow).toEqual({ findings: [], issues: [] });

    const atMaxDepth = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 3,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(atMaxDepth.findings.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
  });

  test('does not follow a symbolic link to a project', async () => {
    const outsideProjectPath = join(fixtureRoot.rootDir, 'outside', 'app');
    await createFixtureDirectory({ path: join(outsideProjectPath, 'node_modules') });
    await createEmptyFile({ path: join(outsideProjectPath, 'package.json') });
    await symlink(outsideProjectPath, join(fixtureRoot.homeDir, 'app-link'));

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('does not treat a file named node_modules as an artifact', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: projectPath });
    await createEmptyFile({ path: join(projectPath, 'package.json') });
    await createEmptyFile({ path: join(projectPath, 'node_modules') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('reports a folder it cannot list and still searches its siblings', async () => {
    const lockedPath = join(fixtureRoot.homeDir, 'locked');
    await createFixtureDirectory({ path: lockedPath });
    await chmod(lockedPath, 0o000);

    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
    expect(result.issues).toEqual([
      { path: lockedPath, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
  });

  test('returns nothing when the home folder is missing', async () => {
    const result = await findProjectArtifacts({
      homeDir: join(fixtureRoot.rootDir, 'missing-home'),
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: NO_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('stops at a passed deadline with one walkStopped issue', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const result = await findProjectArtifacts({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: [],
      rules: PROJECT_ARTIFACT_RULES,
      maxDepth: 4,
      deadlineMs: 0,
    });

    expect(result).toEqual({
      findings: [],
      issues: [{ path: fixtureRoot.homeDir, reason: 'walkStopped', detail: 'deadline' }],
    });
  });
});
