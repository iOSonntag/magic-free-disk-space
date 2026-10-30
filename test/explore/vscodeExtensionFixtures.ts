import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ExplorePathUnitVscodeExtension } from '../../src/explore/exploreUnit.js';
import type { CandidateProbed } from '../../src/scan/candidate.js';
import { buildTestIdentity } from '../support/candidateFixtures.js';
import { createFixtureDirectory, createFixtureFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

/** A command line of VS Code's app, which keeps its extension folders busy. */
export const VSCODE_APP_COMMAND = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';

/** Marked in `.obsolete`, listed by no registry, and the only version of its id: obsolete. */
export const OBSOLETE_FOLDER_NAME = 'example.alpha-1.0.0';

/** The one folder the default registry lists. */
export const DEFAULT_LISTED_FOLDER_NAME = 'example.epsilon-1.0.0';

/** An older version listed by no registry: offered as an older version. */
export const OLDER_FOLDER_NAME = 'example.beta-2.0.0-darwin-arm64';

/** The newer version of `example.beta`, which a profile lists in the old form, by location only. */
export const BETA_CURRENT_FOLDER_NAME = 'example.beta-10.0.0-darwin-arm64';

/** Marked in `.obsolete` but listed by a profile: never offered. */
export const LISTED_OBSOLETE_FOLDER_NAME = 'example.gamma-3.0.0';

/** Listed by no registry, but neither obsolete nor outdated: never offered. */
export const STRAY_FOLDER_NAME = 'example.delta-1.0.0';

export const FIXTURE_PROFILE_ID = '-1a2b3c4d';

export const VSCODE_FOLDER_SIZE_BYTES = 4096;

export function buildVscodeExtensionsPath(params: { homeDir: string }): string {
  return join(params.homeDir, '.vscode/extensions');
}

export function buildVscodeProfilesPath(params: { homeDir: string }): string {
  return join(params.homeDir, 'Library/Application Support/Code/User/profiles');
}

/**
 * A registry as VS Code writes it: one entry per folder with its `location` URI, and in the
 * current form also its `relativeLocation`.
 */
export function buildVscodeRegistryText(params: {
  extensionsPath: string;
  folderNames: string[];
  form: 'current' | 'locationOnly';
}): string {
  const entries = params.folderNames.map((folderName) => {
    const folderPath = join(params.extensionsPath, folderName);
    const [extensionId, version] = folderName.split(/-(?=\d)/);
    const entry = {
      identifier: { id: extensionId },
      version: version?.split('-')[0],
      location: {
        $mid: 1,
        fsPath: folderPath,
        external: `file://${folderPath}`,
        path: folderPath,
        scheme: 'file',
      },
      metadata: { installedTimestamp: 1_700_000_000_000, pinned: false, source: 'gallery' },
    };

    if (params.form === 'locationOnly') {
      return entry;
    }

    return { ...entry, relativeLocation: folderName };
  });

  return JSON.stringify(entries);
}

export function buildVscodeObsoleteText(params: { folderNames: string[] }): string {
  return JSON.stringify(Object.fromEntries(params.folderNames.map((name) => [name, true])));
}

/** Creates each extension folder with one file of `VSCODE_FOLDER_SIZE_BYTES`. */
export async function createVscodeExtensionFolders(params: {
  homeDir: string;
  folderNames: string[];
}): Promise<void> {
  for (const folderName of params.folderNames) {
    const folderPath = join(buildVscodeExtensionsPath(params), folderName);

    await createFixtureDirectory({ path: folderPath });
    await createFixtureFile({
      path: join(folderPath, 'package.json'),
      sizeBytes: VSCODE_FOLDER_SIZE_BYTES,
      modifiedMs: Date.UTC(2026, 0, 1),
    });
  }
}

export async function writeVscodeFile(params: { path: string; text: string }): Promise<void> {
  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, params.text);
}

/**
 * The installation every test starts from: every folder above, the default registry listing the
 * epsilon, a profile listing the current beta and gamma by location only, and `.obsolete`
 * marking alpha 1.0.0 and gamma.
 */
export async function createVscodeInstallation(params: { homeDir: string }): Promise<void> {
  const extensionsPath = buildVscodeExtensionsPath(params);

  await createVscodeExtensionFolders({
    homeDir: params.homeDir,
    folderNames: [
      OBSOLETE_FOLDER_NAME,
      DEFAULT_LISTED_FOLDER_NAME,
      OLDER_FOLDER_NAME,
      BETA_CURRENT_FOLDER_NAME,
      LISTED_OBSOLETE_FOLDER_NAME,
      STRAY_FOLDER_NAME,
    ],
  });
  await writeVscodeFile({
    path: join(extensionsPath, 'extensions.json'),
    text: buildVscodeRegistryText({
      extensionsPath: extensionsPath,
      folderNames: [DEFAULT_LISTED_FOLDER_NAME],
      form: 'current',
    }),
  });
  await writeVscodeFile({
    path: join(buildVscodeProfilesPath(params), FIXTURE_PROFILE_ID, 'extensions.json'),
    text: buildVscodeRegistryText({
      extensionsPath: extensionsPath,
      folderNames: [BETA_CURRENT_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME],
      form: 'locationOnly',
    }),
  });
  await writeVscodeFile({
    path: join(extensionsPath, '.obsolete'),
    text: buildVscodeObsoleteText({
      folderNames: [OBSOLETE_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME],
    }),
  });
}

export function buildObsoleteVscodeUnit(params: {
  homeDir: string;
}): ExplorePathUnitVscodeExtension {
  return {
    kind: 'vscodeExtension',
    folderPath: buildTestAbsolutePath({
      text: join(buildVscodeExtensionsPath(params), OBSOLETE_FOLDER_NAME),
    }),
    extensionId: 'example.alpha',
    version: '1.0.0',
    reason: 'obsolete',
  };
}

export function buildOlderVscodeUnit(params: { homeDir: string }): ExplorePathUnitVscodeExtension {
  return {
    kind: 'vscodeExtension',
    folderPath: buildTestAbsolutePath({
      text: join(buildVscodeExtensionsPath(params), OLDER_FOLDER_NAME),
    }),
    extensionId: 'example.beta',
    version: '2.0.0',
    reason: 'olderVersion',
  };
}

/** The obsolete folder's item as the scan offers it, with a made-up identity. */
export function buildTestVscodeExtensionCandidate(params: { homeDir: string }): CandidateProbed {
  const unit = buildObsoleteVscodeUnit(params);

  return {
    path: unit.folderPath,
    title: 'VS Code extension example.alpha 1.0.0',
    category: 'developer',
    risk: 'review',
    origin: 'explore',
    explanation: 'An extension folder VS Code marked for removal after an uninstall or an update.',
    regeneration: 'VS Code downloads it again only if you install this version again.',
    allocatedBytes: VSCODE_FOLDER_SIZE_BYTES,
    entryCount: 2,
    isComplete: true,
    removal: {
      kind: 'deleteUnitFolder',
      identity: buildTestIdentity({ realPath: unit.folderPath }),
      unit: unit,
    },
    evidenceLines: [
      "Neither VS Code's default registry nor any profile's lists this folder.",
      "VS Code's .obsolete file marks it for removal.",
    ],
  };
}
