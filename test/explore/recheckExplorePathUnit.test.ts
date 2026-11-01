import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
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
  VSCODE_APP_COMMAND,
} from './vscodeExtensionFixtures.js';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let extensionsPath: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  extensionsPath = buildVscodeExtensionsPath({ homeDir: environment.homeDir });
  await createVscodeInstallation({ homeDir: environment.homeDir });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describe('recheckExplorePathUnit of a VS Code extension', () => {
  test('answers unchanged while the folder is unlisted and its reason still holds', async () => {
    for (const unit of [
      buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
      buildOlderVscodeUnit({ homeDir: environment.homeDir }),
    ]) {
      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          processCommands: [],
        }),
      ).toEqual({ kind: 'unchanged' });
    }
  });

  test('answers changed once a profile lists the folder', async () => {
    await writeFixtureTextFile({
      path: join(
        buildVscodeProfilesPath({ homeDir: environment.homeDir }),
        FIXTURE_PROFILE_ID,
        'extensions.json',
      ),
      text: buildVscodeRegistryText({
        extensionsPath: extensionsPath,
        folderNames: [BETA_CURRENT_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME, OBSOLETE_FOLDER_NAME],
        form: 'locationOnly',
      }),
    });

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
        environment: environment,
        processCommands: [],
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
      buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
      buildOlderVscodeUnit({ homeDir: environment.homeDir }),
    ]) {
      expect(
        await recheckExplorePathUnit({
          unit: unit,
          environment: environment,
          processCommands: [],
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('answers changed once the default registry no longer parses', async () => {
    await writeFixtureTextFile({ path: join(extensionsPath, 'extensions.json'), text: '{' });

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
        environment: environment,
        processCommands: [],
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers changed once the folder or the whole extensions folder is gone', async () => {
    const unit = buildObsoleteVscodeUnit({ homeDir: environment.homeDir });

    await rm(unit.folderPath, { recursive: true });

    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({ kind: 'changed' });

    await rm(extensionsPath, { recursive: true });

    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({ kind: 'changed' });
  });

  test('answers busy while VS Code runs or when the processes are unknown', async () => {
    const unit = buildObsoleteVscodeUnit({ homeDir: environment.homeDir });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        processCommands: [VSCODE_APP_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: null }),
    ).toEqual({ kind: 'busy' });
  });

  test('answers failed with the path and the failure of a denied read', async () => {
    const registryPath = join(extensionsPath, 'extensions.json');

    await chmod(registryPath, 0o000);

    expect(
      await recheckExplorePathUnit({
        unit: buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
        environment: environment,
        processCommands: [],
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
