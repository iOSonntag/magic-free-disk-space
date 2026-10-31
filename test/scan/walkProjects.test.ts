import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PROJECT_ARTIFACT_RULES } from '../../src/catalog/projectArtifactRules.js';
import type {
  ProjectPinFileKind,
  ProjectPinFileRef,
} from '../../src/explore/projectPins/projectPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { ProjectWalk } from '../../src/scan/walkProjects.js';
import { walkProjects } from '../../src/scan/walkProjects.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

const NO_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

async function createEmptyFile(params: { path: string }): Promise<void> {
  await createFixtureFile({ path: params.path, sizeBytes: 0, modifiedMs: Date.now() });
}

function buildPinFileRef(params: { path: string; kind: ProjectPinFileKind }): ProjectPinFileRef {
  return { path: buildTestAbsolutePath({ text: params.path }), kind: params.kind };
}

function comparePinFilePaths(left: ProjectPinFileRef, right: ProjectPinFileRef): number {
  return left.path < right.path ? -1 : 1;
}

function walkTestProjects(params: {
  homeDir: AbsolutePath;
  excludedTopNames?: string[];
  maxDepth?: number;
  deadlineMs?: number;
}): Promise<ProjectWalk> {
  return walkProjects({
    homeDir: params.homeDir,
    excludedTopNames: params.excludedTopNames ?? [],
    rules: PROJECT_ARTIFACT_RULES,
    maxDepth: params.maxDepth ?? 4,
    deadlineMs: params.deadlineMs ?? NO_DEADLINE_MS,
  });
}

describe('walkProjects', () => {
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

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result).toEqual({
      artifacts: [
        {
          artifactPath: artifactPath,
          projectRoot: projectPath,
          rule: expect.objectContaining({ artifactName: 'node_modules' }),
        },
      ],
      pinFiles: [],
      isComplete: true,
      issues: [],
    });
  });

  test('does not report node_modules without a marker file', async () => {
    await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'app', 'node_modules') });

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });
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

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
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

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
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

    const result = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      excludedTopNames: ['Library'],
    });

    expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
      join(nestedLibraryProjectPath, 'node_modules'),
    ]);
  });

  test('does not find an artifact deeper than maxDepth, but finds one at maxDepth', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'work', 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const tooShallow = await walkTestProjects({ homeDir: fixtureRoot.homeDir, maxDepth: 2 });

    expect(tooShallow).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });

    const atMaxDepth = await walkTestProjects({ homeDir: fixtureRoot.homeDir, maxDepth: 3 });

    expect(atMaxDepth.artifacts.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
  });

  test('does not follow a symbolic link to a project', async () => {
    const outsideProjectPath = join(fixtureRoot.rootDir, 'outside', 'app');
    await createFixtureDirectory({ path: join(outsideProjectPath, 'node_modules') });
    await createEmptyFile({ path: join(outsideProjectPath, 'package.json') });
    await createEmptyFile({ path: join(outsideProjectPath, '.tool-versions') });
    await symlink(outsideProjectPath, join(fixtureRoot.homeDir, 'app-link'));

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });
  });

  test('does not treat a file named node_modules as an artifact', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: projectPath });
    await createEmptyFile({ path: join(projectPath, 'package.json') });
    await createEmptyFile({ path: join(projectPath, 'node_modules') });

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });
  });

  test('reports a folder it cannot list, still searches its siblings, and is not complete', async () => {
    const lockedPath = join(fixtureRoot.homeDir, 'locked');
    await createFixtureDirectory({ path: lockedPath });
    await chmod(lockedPath, 0o000);

    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
    expect(result.isComplete).toBe(false);
    expect(result.issues).toEqual([
      { path: lockedPath, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
  });

  test('returns nothing, and is complete, when the home folder is missing', async () => {
    const result = await walkTestProjects({
      homeDir: buildTestAbsolutePath({ text: join(fixtureRoot.rootDir, 'missing-home') }),
    });

    expect(result).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });
  });

  test('stops at a passed deadline with one walkStopped issue, and is not complete', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir, deadlineMs: 0 });

    expect(result).toEqual({
      artifacts: [],
      pinFiles: [],
      isComplete: false,
      issues: [{ path: fixtureRoot.homeDir, reason: 'walkStopped', detail: 'deadline' }],
    });
  });

  test('collects the pin files it passes, a dot file at the top among them', async () => {
    const pnpmProjectPath = join(fixtureRoot.homeDir, 'web');
    const npmProjectPath = join(fixtureRoot.homeDir, 'tool');
    const androidProjectPath = join(fixtureRoot.homeDir, 'dev', 'android');
    await createEmptyFile({ path: join(fixtureRoot.homeDir, '.tool-versions') });
    await createFixtureDirectory({ path: pnpmProjectPath });
    await createEmptyFile({ path: join(pnpmProjectPath, 'package.json') });
    await createEmptyFile({ path: join(pnpmProjectPath, 'pnpm-lock.yaml') });
    await createEmptyFile({ path: join(pnpmProjectPath, '.nvmrc') });
    await createEmptyFile({ path: join(pnpmProjectPath, 'mise.toml') });
    await createFixtureDirectory({ path: npmProjectPath });
    await createEmptyFile({ path: join(npmProjectPath, 'package.json') });
    await createEmptyFile({ path: join(npmProjectPath, 'other.toml') });
    await createFixtureDirectory({ path: join(androidProjectPath, 'app') });
    await createEmptyFile({ path: join(androidProjectPath, 'build.gradle.kts') });
    await writeFile(join(androidProjectPath, 'app', 'build.gradle'), 'android {}\n');

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    const expectedPinFiles = [
      buildPinFileRef({ path: join(fixtureRoot.homeDir, '.tool-versions'), kind: 'toolVersions' }),
      buildPinFileRef({ path: join(androidProjectPath, 'app', 'build.gradle'), kind: 'gradle' }),
      buildPinFileRef({ path: join(androidProjectPath, 'build.gradle.kts'), kind: 'gradle' }),
      buildPinFileRef({ path: join(pnpmProjectPath, '.nvmrc'), kind: 'nvmrc' }),
      buildPinFileRef({ path: join(pnpmProjectPath, 'mise.toml'), kind: 'miseConfig' }),
      buildPinFileRef({ path: join(pnpmProjectPath, 'package.json'), kind: 'packageJson' }),
    ];

    expect(result.pinFiles.toSorted(comparePinFilePaths)).toEqual(
      expectedPinFiles.toSorted(comparePinFilePaths),
    );
    expect(result.isComplete).toBe(true);
  });

  test('keeps a pin file that is a link, without following it', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    await createFixtureDirectory({ path: projectPath });
    await symlink(
      join(fixtureRoot.rootDir, 'gone.tool-versions'),
      join(projectPath, '.tool-versions'),
    );

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.pinFiles).toEqual([
      buildPinFileRef({ path: join(projectPath, '.tool-versions'), kind: 'toolVersions' }),
    ]);
  });

  test('collects no pin file in a skipped folder', async () => {
    await createFixtureDirectory({ path: join(fixtureRoot.homeDir, '.hidden', 'app') });
    await createEmptyFile({ path: join(fixtureRoot.homeDir, '.hidden', 'app', '.nvmrc') });
    await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'app', 'node_modules', 'x') });
    await createEmptyFile({ path: join(fixtureRoot.homeDir, 'app', 'package.json') });
    await createEmptyFile({
      path: join(fixtureRoot.homeDir, 'app', 'node_modules', 'x', '.nvmrc'),
    });

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.pinFiles).toEqual([]);
  });
});
