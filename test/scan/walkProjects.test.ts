import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Risk } from '../../src/catalog/catalog.js';
import type { ProjectArtifactRule } from '../../src/catalog/projectArtifactRules.js';
import { PROJECT_ARTIFACT_RULES } from '../../src/catalog/projectArtifactRules.js';
import type {
  ProjectPinFileKind,
  ProjectPinFileRef,
} from '../../src/explore/projectPins/projectPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { PathRules } from '../../src/path/pathRules.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { WIN32_CATALOG } from '../../src/platform/win32/catalog/win32Catalog.js';
import { DAY_MS, SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ProjectWalk } from '../../src/scan/walkProjects.js';
import { walkProjects } from '../../src/scan/walkProjects.js';
import type { EntryRef } from '../../src/system/entryReads.js';
import type { EvictedEntryRecorder } from '../../src/system/walkDirectoryTree.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { buildTestHostPath, HOST_PATH_RULES } from '../support/parsedValueFixtures.js';
import { HOST_PLATFORM } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { runTestScan } from '../support/scanRunFixtures.js';

const NO_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

const MINUTE_MS = 60_000;

async function createEmptyFile(params: { path: string }): Promise<void> {
  await createFixtureFile({ path: params.path, sizeBytes: 0, modifiedMs: Date.now() });
}

/**
 * A Rust project in `folder` whose `target` holds enough to offer, and whose folder and
 * `Cargo.toml`, all its activity probe reads, changed at `modifiedMs`. Returns the `target` path.
 */
async function createDatedRustProject(params: {
  fixtureRoot: FixtureRoot;
  folder: string;
  modifiedMs: number;
}): Promise<string> {
  const projectPath = join(params.fixtureRoot.homeDir, params.folder);
  const targetPath = join(projectPath, 'target');

  await createFixtureFile({
    path: join(targetPath, 'app.rlib'),
    sizeBytes: SCAN_LIMITS.minOfferedBytes,
    modifiedMs: params.modifiedMs,
  });
  await createFixtureFile({
    path: join(projectPath, 'Cargo.toml'),
    sizeBytes: 0,
    modifiedMs: params.modifiedMs,
  });
  // Creating its entries changed the folder itself, which the probe reads as well.
  await updateModifiedMs({ path: projectPath, modifiedMs: params.modifiedMs });

  return targetPath;
}

/**
 * A .NET project in `Service` whose build folders and project file are spelled in upper case:
 * `Bin`, `OBJ`, and `Foo.CSPROJ`. Returns the project's path.
 */
async function createUpperCaseDotnetProject(params: { fixtureRoot: FixtureRoot }): Promise<string> {
  const projectPath = join(params.fixtureRoot.homeDir, 'Service');

  await createFixtureDirectory({ path: join(projectPath, 'Bin', 'Debug') });
  await createFixtureDirectory({ path: join(projectPath, 'OBJ') });
  await createEmptyFile({ path: join(projectPath, 'Foo.CSPROJ') });

  return projectPath;
}

function buildPinFileRef(params: { path: string; kind: ProjectPinFileKind }): ProjectPinFileRef {
  return { path: buildTestHostPath({ text: params.path }), kind: params.kind };
}

function comparePinFilePaths(left: ProjectPinFileRef, right: ProjectPinFileRef): number {
  return left.path < right.path ? -1 : 1;
}

function walkTestProjects(params: {
  pathRules?: PathRules;
  homeDir: AbsolutePath;
  excludedTopNames?: string[];
  rules?: ProjectArtifactRule[];
  maxDepth?: number;
  deadlineMs?: number;
  cloudOnlyPaths?: string[];
  linkPaths?: string[];
  recordEvictedEntry?: EvictedEntryRecorder;
}): Promise<ProjectWalk> {
  return walkProjects({
    pathRules: params.pathRules ?? HOST_PATH_RULES,
    homeDir: params.homeDir,
    excludedTopNames: params.excludedTopNames ?? [],
    rules: params.rules ?? PROJECT_ARTIFACT_RULES,
    maxDepth: params.maxDepth ?? 4,
    deadlineMs: params.deadlineMs ?? NO_DEADLINE_MS,
    entryReads: buildTestEntryReads({
      privateBytes: null,
      cloudOnlyPaths: params.cloudOnlyPaths ?? [],
      linkPaths: params.linkPaths ?? [],
    }),
    recordEvictedEntry: params.recordEvictedEntry ?? (() => undefined),
    privacyDenialCode: HOST_PLATFORM.system.privacyDenialCode,
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

  test('finds bin and obj beside a file whose name ends in a project ending of .NET', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'Service');
    await createFixtureDirectory({ path: join(projectPath, 'bin', 'Debug') });
    await createFixtureDirectory({ path: join(projectPath, 'obj') });
    await createEmptyFile({ path: join(projectPath, 'Service.Api.csproj') });

    const result = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      rules: WIN32_CATALOG.projectArtifactRules,
    });

    expect(
      result.artifacts.map((finding) => ({
        artifactPath: finding.artifactPath,
        artifactName: finding.rule.artifactName,
      })),
    ).toEqual([
      { artifactPath: join(projectPath, 'bin'), artifactName: 'bin' },
      { artifactPath: join(projectPath, 'obj'), artifactName: 'obj' },
    ]);
  });

  test('finds Bin and OBJ beside Foo.CSPROJ under the rules of Windows, which ignore case', async () => {
    const projectPath = await createUpperCaseDotnetProject({ fixtureRoot: fixtureRoot });

    const result = await walkTestProjects({
      pathRules: WIN32_PATH_RULES,
      homeDir: fixtureRoot.homeDir,
      rules: WIN32_CATALOG.projectArtifactRules,
    });

    expect(
      result.artifacts.map((finding) => ({
        artifactPath: finding.artifactPath,
        artifactName: finding.rule.artifactName,
      })),
    ).toEqual([
      { artifactPath: join(projectPath, 'Bin'), artifactName: 'bin' },
      { artifactPath: join(projectPath, 'OBJ'), artifactName: 'obj' },
    ]);
  });

  test('finds no Bin or OBJ beside Foo.CSPROJ under the rules of POSIX, which match names exactly', async () => {
    await createUpperCaseDotnetProject({ fixtureRoot: fixtureRoot });

    const result = await walkTestProjects({
      pathRules: DARWIN_PATH_RULES,
      homeDir: fixtureRoot.homeDir,
      rules: WIN32_CATALOG.projectArtifactRules,
    });

    expect(result.artifacts).toEqual([]);
  });

  test('walks into a bin folder without a project file beside it, as any other folder', async () => {
    const toolsPath = join(fixtureRoot.homeDir, 'tools');
    const projectPath = join(toolsPath, 'bin', 'app');
    await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
    await createEmptyFile({ path: join(projectPath, 'package.json') });
    await createEmptyFile({ path: join(toolsPath, 'bin.csproj.bak') });

    const result = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      rules: WIN32_CATALOG.projectArtifactRules,
    });

    expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
      join(projectPath, 'node_modules'),
    ]);
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

  test.skipIf(process.platform !== 'win32')(
    'skips a top folder named as an excluded name in another case, as Windows compares names',
    async () => {
      const projectPath = join(fixtureRoot.homeDir, 'appdata', 'app');
      await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
      await createEmptyFile({ path: join(projectPath, 'package.json') });

      const result = await walkTestProjects({
        homeDir: fixtureRoot.homeDir,
        excludedTopNames: ['AppData'],
      });

      expect(result.artifacts).toEqual([]);
    },
  );

  test.skipIf(process.platform !== 'darwin')(
    'walks a top folder whose name differs from an excluded name in case, as macOS compares names',
    async () => {
      const projectPath = join(fixtureRoot.homeDir, 'library', 'app');
      await createFixtureDirectory({ path: join(projectPath, 'node_modules') });
      await createEmptyFile({ path: join(projectPath, 'package.json') });

      const result = await walkTestProjects({
        homeDir: fixtureRoot.homeDir,
        excludedTopNames: ['Library'],
      });

      expect(result.artifacts.map((finding) => finding.artifactPath)).toEqual([
        join(projectPath, 'node_modules'),
      ]);
    },
  );

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

  testOnPosix('does not follow a symbolic link to a project', async () => {
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

  testOnPosix(
    'reports a folder it cannot list, still searches its siblings, and is not complete',
    async () => {
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
    },
  );

  test('skips an evicted project folder without an issue, and is not complete', async () => {
    const evictedProjectPath = join(fixtureRoot.homeDir, 'old-app');
    await createFixtureDirectory({ path: evictedProjectPath });
    await createEmptyFile({ path: join(evictedProjectPath, '.nvmrc') });

    const recordedEntries: EntryRef[] = [];

    const evictedWalk = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      cloudOnlyPaths: [evictedProjectPath],
      recordEvictedEntry: (entry) => {
        recordedEntries.push(entry);
      },
    });
    const residentWalk = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(evictedWalk).toEqual({ artifacts: [], pinFiles: [], isComplete: false, issues: [] });
    expect(recordedEntries).toEqual([{ path: evictedProjectPath, kind: 'directory' }]);
    expect(residentWalk.isComplete).toBe(true);
  });

  test('never enters a project folder the entry reads call a link', async () => {
    // As a mounted folder on Windows, which lstat calls a folder and its reparse point a link.
    const linkedProjectPath = join(fixtureRoot.homeDir, 'mounted');
    await createFixtureDirectory({ path: join(linkedProjectPath, 'node_modules') });
    await createEmptyFile({ path: join(linkedProjectPath, 'package.json') });
    await createEmptyFile({ path: join(linkedProjectPath, '.nvmrc') });

    const result = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      linkPaths: [linkedProjectPath],
    });

    expect(result).toEqual({ artifacts: [], pinFiles: [], isComplete: true, issues: [] });
  });

  test('is not complete for an evicted pin file, and complete for an evicted file of another name', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    const pinFilePath = join(projectPath, '.nvmrc');
    const notesPath = join(projectPath, 'notes.txt');
    await createFixtureDirectory({ path: projectPath });
    await createEmptyFile({ path: pinFilePath });
    await createEmptyFile({ path: notesPath });

    const pinFileWalk = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      cloudOnlyPaths: [pinFilePath],
    });
    const notesWalk = await walkTestProjects({
      homeDir: fixtureRoot.homeDir,
      cloudOnlyPaths: [notesPath],
    });

    expect(pinFileWalk).toEqual({ artifacts: [], pinFiles: [], isComplete: false, issues: [] });
    expect(notesWalk).toEqual({
      artifacts: [],
      pinFiles: [buildPinFileRef({ path: pinFilePath, kind: 'nvmrc' })],
      isComplete: true,
      issues: [],
    });
  });

  test('returns nothing, and is complete, when the home folder is missing', async () => {
    const result = await walkTestProjects({
      homeDir: buildTestHostPath({ text: join(fixtureRoot.rootDir, 'missing-home') }),
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

  testOnPosix('keeps a pin file that is a link, without following it', async () => {
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

  test('finds each new project folder beside its marker file, with the risk of its rule', async () => {
    // Dependencies that a reinstall must download again are for review; build output is safe.
    const projects: { folder: string; artifact: string; marker: string; risk: Risk }[] = [
      { folder: 'sst-app', artifact: '.sst', marker: 'sst.config.ts', risk: 'safe' },
      { folder: 'rust-app', artifact: 'target', marker: 'Cargo.toml', risk: 'safe' },
      { folder: 'android-app', artifact: 'build', marker: 'build.gradle.kts', risk: 'safe' },
      { folder: 'flutter-app', artifact: 'build', marker: 'pubspec.yaml', risk: 'safe' },
      { folder: 'swift-package', artifact: '.build', marker: 'Package.swift', risk: 'safe' },
      { folder: 'gradle-app', artifact: '.gradle', marker: 'settings.gradle', risk: 'safe' },
      { folder: 'ios-app', artifact: 'Pods', marker: 'Podfile', risk: 'review' },
      { folder: 'php-app', artifact: 'vendor', marker: 'composer.json', risk: 'review' },
      { folder: 'infra', artifact: '.terraform', marker: 'main.tf', risk: 'review' },
      { folder: 'svelte-app', artifact: '.svelte-kit', marker: 'package.json', risk: 'safe' },
      { folder: 'nuxt-app', artifact: '.nuxt', marker: 'package.json', risk: 'safe' },
      { folder: 'angular-app', artifact: '.angular', marker: 'package.json', risk: 'safe' },
    ];

    for (const project of projects) {
      const projectPath = join(fixtureRoot.homeDir, project.folder);
      await createFixtureDirectory({ path: join(projectPath, project.artifact) });
      await createEmptyFile({ path: join(projectPath, project.marker) });
    }

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(
      result.artifacts.map((finding) => [
        finding.artifactPath,
        finding.rule.artifactName,
        finding.rule.risk,
      ]),
    ).toEqual(
      projects
        .map((project) => [
          join(fixtureRoot.homeDir, project.folder, project.artifact),
          project.artifact,
          project.risk,
        ])
        .toSorted((left, right) => ((left[0] ?? '') < (right[0] ?? '') ? -1 : 1)),
    );
  });

  test('offers a build folder of a project unchanged for the stale days, and keeps a newer one', async () => {
    const nowMs = Date.UTC(2026, 6, 1);
    const cutoffMs = nowMs - SCAN_LIMITS.defaultStaleDays * DAY_MS;
    const stalePath = await createDatedRustProject({
      fixtureRoot: fixtureRoot,
      folder: 'stale-app',
      modifiedMs: cutoffMs - MINUTE_MS,
    });
    const recentPath = await createDatedRustProject({
      fixtureRoot: fixtureRoot,
      folder: 'recent-app',
      modifiedMs: cutoffMs + MINUTE_MS,
    });

    const report = await runTestScan({
      environment: await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: nowMs }),
      catalogEntries: [],
    });

    expect(report.candidates.map((candidate) => candidate.path)).toContain(stalePath);
    expect(report.candidates.map((candidate) => candidate.path)).not.toContain(recentPath);
    expect(report.skipped).toContainEqual({ path: recentPath, reason: 'recentActivity' });
  });

  test('does not report a new project folder without its marker file', async () => {
    const unmarked: { folder: string; artifact: string; other: string }[] = [
      { folder: 'docs', artifact: 'build', other: 'Makefile' },
      { folder: 'notes', artifact: 'target', other: 'README.md' },
      { folder: 'infra', artifact: '.terraform', other: '.tf' },
      { folder: 'libs', artifact: 'vendor', other: 'package.json' },
      { folder: 'gradle-sub', artifact: '.gradle', other: 'build.gradle' },
    ];

    for (const project of unmarked) {
      const projectPath = join(fixtureRoot.homeDir, project.folder);
      await createFixtureDirectory({ path: join(projectPath, project.artifact) });
      await createEmptyFile({ path: join(projectPath, project.other) });
    }

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.artifacts).toEqual([]);
  });

  test('collects rust-toolchain, .fvmrc, and local.properties as pin files', async () => {
    const projectPath = join(fixtureRoot.homeDir, 'app');
    const names: { name: string; kind: ProjectPinFileKind }[] = [
      { name: 'rust-toolchain.toml', kind: 'rustToolchain' },
      { name: 'rust-toolchain', kind: 'rustToolchain' },
      { name: '.fvmrc', kind: 'fvmrc' },
      { name: 'local.properties', kind: 'androidLocalProperties' },
    ];
    await createFixtureDirectory({ path: projectPath });

    for (const entry of names) {
      await createEmptyFile({ path: join(projectPath, entry.name) });
    }

    const result = await walkTestProjects({ homeDir: fixtureRoot.homeDir });

    expect(result.pinFiles.toSorted(comparePinFilePaths)).toEqual(
      names
        .map((entry) => buildPinFileRef({ path: join(projectPath, entry.name), kind: entry.kind }))
        .toSorted(comparePinFilePaths),
    );
  });
});
