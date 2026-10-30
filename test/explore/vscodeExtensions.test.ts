import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, realpath, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExploreFinding, ExploreProbeFindings } from '../../src/explore/exploreUnit.js';
import { loadVscodeExtensionFindings } from '../../src/explore/vscodeExtensions/loadVscodeExtensionFindings.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import {
  buildObsoleteVscodeUnit,
  buildOlderVscodeUnit,
  buildVscodeExtensionsPath,
  buildVscodeObsoleteText,
  buildVscodeProfilesPath,
  buildVscodeRegistryText,
  createVscodeExtensionFolders,
  createVscodeInstallation,
  DEFAULT_LISTED_FOLDER_NAME,
  FIXTURE_PROFILE_ID,
  LISTED_OBSOLETE_FOLDER_NAME,
  OBSOLETE_FOLDER_NAME,
  OLDER_FOLDER_NAME,
  VSCODE_APP_COMMAND,
  writeVscodeFile,
} from './vscodeExtensionFixtures.js';

const LINKED_OLDER_FOLDER_NAME = 'pub.ext-1.0.0';

const LINKED_NEWER_FOLDER_NAME = 'pub.ext-1.1.0';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let extensionsPath: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  extensionsPath = buildVscodeExtensionsPath({ homeDir: environment.homeDir });
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildRun(processCommands: string[] | null): ExploreProbeRun {
  return {
    environment: environment,
    processCommands: processCommands,
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: 0,
  };
}

async function loadFindings(processCommands: string[] | null = []): Promise<ExploreProbeFindings> {
  const findings = await loadVscodeExtensionFindings(buildRun(processCommands));

  if (findings.kind === 'failed') {
    throw new Error(`The probe failed at ${findings.failure.path}.`);
  }

  return findings.value;
}

/**
 * Two versions of one id in the linked extensions folder: the default registry lists the newer
 * by `relativeLocation`, a profile the older by a location under `profileExtensionsPath`, the real
 * path of the folder when it is `null`.
 */
async function createLinkedVscodeInstallation(
  params: { profileExtensionsPath: string | null } = { profileExtensionsPath: null },
): Promise<void> {
  const profileExtensionsPath = params.profileExtensionsPath ?? (await realpath(extensionsPath));

  await createVscodeExtensionFolders({
    homeDir: environment.homeDir,
    folderNames: [LINKED_OLDER_FOLDER_NAME, LINKED_NEWER_FOLDER_NAME],
  });
  await writeVscodeFile({
    path: join(extensionsPath, 'extensions.json'),
    text: buildVscodeRegistryText({
      extensionsPath: extensionsPath,
      folderNames: [LINKED_NEWER_FOLDER_NAME],
      form: 'current',
    }),
  });
  await writeVscodeFile({
    path: join(
      buildVscodeProfilesPath({ homeDir: environment.homeDir }),
      FIXTURE_PROFILE_ID,
      'extensions.json',
    ),
    text: buildVscodeRegistryText({
      extensionsPath: profileExtensionsPath,
      folderNames: [LINKED_OLDER_FOLDER_NAME],
      form: 'locationOnly',
    }),
  });
}

function listFolderPaths(findings: ExploreFinding[]): string[] {
  return findings.map((finding) => finding.displayPath);
}

describe('loadVscodeExtensionFindings', () => {
  test('offers the obsolete folder and the older version that no registry lists', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });

    const probed = await loadFindings();

    expect(probed.isComplete).toBe(true);
    expect(probed.findings).toEqual([
      {
        unit: buildObsoleteVscodeUnit({ homeDir: environment.homeDir }),
        title: 'VS Code extension example.alpha 1.0.0',
        explanation:
          'An extension folder VS Code marked for removal after an uninstall or an update.',
        regeneration: 'VS Code downloads it again only if you install this version again.',
        risk: 'review',
        evidenceLines: [
          "Neither VS Code's default registry nor any profile's lists this folder.",
          "VS Code's .obsolete file marks it for removal.",
        ],
        displayPath: join(extensionsPath, OBSOLETE_FOLDER_NAME),
        activity: 'idle',
      },
      {
        unit: buildOlderVscodeUnit({ homeDir: environment.homeDir }),
        title: 'VS Code extension example.beta 2.0.0',
        explanation: 'An older version of an extension, left beside a newer version of it.',
        regeneration: 'VS Code downloads it again only if you install this version again.',
        risk: 'review',
        evidenceLines: [
          "Neither VS Code's default registry nor any profile's lists this folder.",
          'Version 10.0.0 of example.beta is installed beside it.',
        ],
        displayPath: join(extensionsPath, OLDER_FOLDER_NAME),
        activity: 'idle',
      },
    ]);
  });

  test('offers a folder that is both obsolete and outdated as obsolete', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({
      path: join(extensionsPath, '.obsolete'),
      text: buildVscodeObsoleteText({ folderNames: [OLDER_FOLDER_NAME] }),
    });

    const probed = await loadFindings();

    expect(probed.findings.map((finding) => finding.unit)).toEqual([
      { ...buildOlderVscodeUnit({ homeDir: environment.homeDir }), reason: 'obsolete' },
    ]);
  });

  test('never offers a folder a registry lists, matched without case', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({
      path: join(extensionsPath, 'extensions.json'),
      text: buildVscodeRegistryText({
        extensionsPath: extensionsPath,
        folderNames: [DEFAULT_LISTED_FOLDER_NAME, OBSOLETE_FOLDER_NAME.toUpperCase()],
        form: 'current',
      }),
    });

    const probed = await loadFindings();

    expect(listFolderPaths(probed.findings)).toEqual([join(extensionsPath, OLDER_FOLDER_NAME)]);
  });

  test('takes an entry whose only location is a string as listing nothing, as VS Code does', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({
      path: join(extensionsPath, 'extensions.json'),
      text: JSON.stringify([
        { identifier: { id: 'example.alpha' }, version: '1.0.0', location: OBSOLETE_FOLDER_NAME },
      ]),
    });

    const probed = await loadFindings();

    expect(probed.isComplete).toBe(true);
    expect(listFolderPaths(probed.findings)).toContain(join(extensionsPath, OBSOLETE_FOLDER_NAME));
  });

  test('marks an offer busy while VS Code runs and unknown when the processes are unknown', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });

    const running = await loadFindings([VSCODE_APP_COMMAND]);
    const unknown = await loadFindings(null);

    expect(running.findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
    expect(unknown.findings.map((finding) => finding.activity)).toEqual(['unknown', 'unknown']);
  });

  test('ignores a file and a name that is no extension folder', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({ path: join(extensionsPath, 'example.alpha-0.1.0'), text: 'a file' });
    await createFixtureDirectory({ path: join(extensionsPath, 'example.alpha-0.2.0.vsctmp') });

    const probed = await loadFindings();

    expect(listFolderPaths(probed.findings)).toEqual([
      join(extensionsPath, OBSOLETE_FOLDER_NAME),
      join(extensionsPath, OLDER_FOLDER_NAME),
    ]);
  });

  test('never offers a version a profile lists through the real path of a linked extensions folder', async () => {
    const realExtensionsPath = join(environment.homeDir, 'real-vscode-extensions');

    await createFixtureDirectory({ path: realExtensionsPath });
    await createFixtureDirectory({ path: join(environment.homeDir, '.vscode') });
    await symlink(realExtensionsPath, extensionsPath);
    await createLinkedVscodeInstallation();

    expect(await loadFindings()).toEqual({ findings: [], isComplete: true });
  });

  test('never offers a version a profile lists through the real path of a linked .vscode folder', async () => {
    const realVscodePath = join(environment.homeDir, 'real-vscode');

    await createFixtureDirectory({ path: join(realVscodePath, 'extensions') });
    await symlink(realVscodePath, join(environment.homeDir, '.vscode'));
    await createLinkedVscodeInstallation();

    expect(await loadFindings()).toEqual({ findings: [], isComplete: true });
  });

  test('never offers a version a profile lists through a second link to the extensions folder', async () => {
    const realExtensionsPath = join(environment.homeDir, 'real-vscode-extensions');
    const secondLinkPath = join(environment.homeDir, 'second-vscode-extensions');

    await createFixtureDirectory({ path: realExtensionsPath });
    await createFixtureDirectory({ path: join(environment.homeDir, '.vscode') });
    await symlink(realExtensionsPath, extensionsPath);
    await symlink(realExtensionsPath, secondLinkPath);
    await createLinkedVscodeInstallation({ profileExtensionsPath: secondLinkPath });

    expect(await loadFindings()).toEqual({ findings: [], isComplete: true });
  });

  test('offers a linked extension folder, which the scan then skips as a link', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await symlink(
      join(extensionsPath, DEFAULT_LISTED_FOLDER_NAME),
      join(extensionsPath, 'example.epsilon-0.9.0'),
    );

    const probed = await loadFindings();

    expect(listFolderPaths(probed.findings)).toContain(
      join(extensionsPath, 'example.epsilon-0.9.0'),
    );
  });
});

describe('loadVscodeExtensionFindings by what each read finds', () => {
  test('judges no extensions folder as nothing installed', async () => {
    expect(await loadFindings()).toEqual({ findings: [], isComplete: true });
  });

  test('judges nothing without the default registry, never reading it as listing nothing', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await rm(join(extensionsPath, 'extensions.json'));

    expect(await loadFindings()).toEqual({ findings: [], isComplete: false });
  });

  test('judges nothing when the default registry does not parse or is unfit', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({
      path: join(extensionsPath, 'extensions.json'),
      text: '{"not": "a list"}',
    });

    expect(await loadFindings()).toEqual({ findings: [], isComplete: false });

    await writeVscodeFile({
      path: join(extensionsPath, 'extensions.json'),
      text: JSON.stringify([{ identifier: { id: 'example.alpha' }, version: '1.2.0' }]),
    });

    expect(await loadFindings()).toEqual({ findings: [], isComplete: false });

    await rm(join(extensionsPath, 'extensions.json'));
    await mkdir(join(extensionsPath, 'extensions.json'));

    expect(await loadFindings()).toEqual({ findings: [], isComplete: false });
  });

  test('adds nothing for no profiles folder, a profile without a registry, or a stray file', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await rm(buildVscodeProfilesPath({ homeDir: environment.homeDir }), { recursive: true });

    const withoutProfiles = await loadFindings();

    expect(withoutProfiles.isComplete).toBe(true);
    expect(listFolderPaths(withoutProfiles.findings)).toEqual([
      join(extensionsPath, OBSOLETE_FOLDER_NAME),
      join(extensionsPath, OLDER_FOLDER_NAME),
      join(extensionsPath, LISTED_OBSOLETE_FOLDER_NAME),
    ]);

    const profilesPath = buildVscodeProfilesPath({ homeDir: environment.homeDir });

    await createFixtureDirectory({ path: join(profilesPath, 'empty-profile') });
    await writeVscodeFile({ path: join(profilesPath, '.DS_Store'), text: 'stray' });

    expect(await loadFindings()).toEqual(withoutProfiles);
  });

  test("judges nothing when a profile's registry does not parse", async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({
      path: join(
        buildVscodeProfilesPath({ homeDir: environment.homeDir }),
        FIXTURE_PROFILE_ID,
        'extensions.json',
      ),
      text: '[{"identifier"',
    });

    expect(await loadFindings()).toEqual({ findings: [], isComplete: false });
  });

  test('offers only older versions without .obsolete, and judges them all', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await rm(join(extensionsPath, '.obsolete'));

    const probed = await loadFindings();

    expect(probed.isComplete).toBe(true);
    expect(listFolderPaths(probed.findings)).toEqual([join(extensionsPath, OLDER_FOLDER_NAME)]);
  });

  test('still offers older versions when .obsolete does not parse, but not as complete', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await writeVscodeFile({ path: join(extensionsPath, '.obsolete'), text: '["no object"]' });

    const probed = await loadFindings();

    expect(probed.isComplete).toBe(false);
    expect(listFolderPaths(probed.findings)).toEqual([join(extensionsPath, OLDER_FOLDER_NAME)]);
  });

  test('fails with the path of a read that was denied', async () => {
    await createVscodeInstallation({ homeDir: environment.homeDir });
    await chmod(join(extensionsPath, 'extensions.json'), 0o000);

    expect(await loadVscodeExtensionFindings(buildRun([]))).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: join(extensionsPath, 'extensions.json'),
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });

  test('fails with the path of an extensions folder or a profiles folder it cannot list', async () => {
    const profilesPath = buildVscodeProfilesPath({ homeDir: environment.homeDir });

    await createVscodeInstallation({ homeDir: environment.homeDir });

    try {
      await chmod(profilesPath, 0o000);

      expect(await loadVscodeExtensionFindings(buildRun([]))).toMatchObject({
        kind: 'failed',
        failure: { reason: 'fileUnreadable', path: profilesPath },
      });

      await chmod(profilesPath, 0o700);
      await chmod(extensionsPath, 0o000);

      expect(await loadVscodeExtensionFindings(buildRun([]))).toMatchObject({
        kind: 'failed',
        failure: { reason: 'fileUnreadable', path: extensionsPath },
      });
    } finally {
      // The fixture root is deleted after the test, which a folder nobody may list prevents.
      await chmod(profilesPath, 0o700);
      await chmod(extensionsPath, 0o700);
    }
  });

  test('offers no folder of an empty extensions folder', async () => {
    await createFixtureDirectory({ path: extensionsPath });
    await writeVscodeFile({ path: join(extensionsPath, 'extensions.json'), text: '[]' });

    expect(await loadFindings()).toEqual({ findings: [], isComplete: true });
  });
});
