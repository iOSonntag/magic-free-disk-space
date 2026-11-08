import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import {
  BETA_CURRENT_FOLDER_NAME,
  buildObsoleteVscodeUnit,
  buildOlderVscodeUnit,
  buildVscodeExtensionsPath,
  buildVscodeObsoleteText,
  buildVscodeProfilesPath,
  buildVscodeRegistryText,
  createVscodeInstallation,
  FIXTURE_PROFILE_ID,
  LISTED_OBSOLETE_FOLDER_NAME,
  OBSOLETE_FOLDER_NAME,
  runningVscodeProcesses,
} from './vscodeExtensionFixtures.js';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let extensionsPath: AbsolutePath;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  extensionsPath = buildVscodeExtensionsPath({ home: environment });
  await createVscodeInstallation({ environment: environment });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('recheckExplorePathUnit of a VS Code extension', () => {
  test('answers unchanged while the folder is unlisted and its reason still holds', async () => {
    for (const unit of [
      buildObsoleteVscodeUnit({ home: environment }),
      buildOlderVscodeUnit({ home: environment }),
    ]) {
      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          platform: buildTestProbePlatform(),
          runningProcesses: buildRunningCommandLines([]),
        }),
      ).toEqual({ kind: 'unchanged' });
    }
  });

  test('answers changed once a profile lists the folder', async () => {
    await writeFixtureTextFile({
      path: join(
        buildVscodeProfilesPath({ environment: environment }),
        FIXTURE_PROFILE_ID,
        'extensions.json',
      ),
      text: buildVscodeRegistryText({
        pathRules: environment.pathRules,
        extensionsPath: extensionsPath,
        folderNames: [BETA_CURRENT_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME, OBSOLETE_FOLDER_NAME],
        form: 'locationOnly',
      }),
    });

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ home: environment }),
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers changed once the scanned reason no longer holds', async () => {
    await writeFixtureTextFile({
      path: join(extensionsPath, '.obsolete'),
      text: buildVscodeObsoleteText({ folderNames: [LISTED_OBSOLETE_FOLDER_NAME] }),
    });
    await rm(join(extensionsPath, BETA_CURRENT_FOLDER_NAME), { recursive: true });

    for (const unit of [
      buildObsoleteVscodeUnit({ home: environment }),
      buildOlderVscodeUnit({ home: environment }),
    ]) {
      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          platform: buildTestProbePlatform(),
          runningProcesses: buildRunningCommandLines([]),
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once the default registry no longer parses', async () => {
    await writeFixtureTextFile({ path: join(extensionsPath, 'extensions.json'), text: '{' });

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ home: environment }),
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers changed once the folder or the whole extensions folder is gone', async () => {
    const unit = buildObsoleteVscodeUnit({ home: environment });

    await rm(unit.folderPath, { recursive: true });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });

    await rm(extensionsPath, { recursive: true });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while VS Code runs or when the processes are unknown', async () => {
    const unit = buildObsoleteVscodeUnit({ home: environment });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: runningVscodeProcesses,
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: null,
      }),
    ).toEqual({ kind: 'busy' });
  });

  testOnPosix('answers failed with the path and the failure of a denied read', async () => {
    const registryPath = join(extensionsPath, 'extensions.json');

    await chmod(registryPath, 0o000);

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ home: environment }),
        environment: environment,
        platform: buildTestProbePlatform(),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: registryPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });
});
