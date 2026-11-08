import type { Environment } from '../../src/environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../../src/environment/environmentLocation.js';
import type { ExplorePathUnitVscodeExtension } from '../../src/explore/exploreUnit.js';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { PathRules } from '../../src/path/pathRules.js';
import type { CandidateProbed } from '../../src/scan/candidate.js';
import type { RunningProcesses } from '../../src/system/systemPlatform.js';
import { buildTestIdentity, buildTestProbedCandidate } from '../support/candidateFixtures.js';
import { createFixtureFile, writeFixtureTextFile } from '../support/fixtureRoot.js';
import type { HomeFolder } from '../support/parsedValueFixtures.js';
import { joinBelowHome } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import {
  buildRunningCommandLines,
  buildRunningImagePaths,
} from '../support/runningProcessesFixtures.js';

/** A command line of VS Code's app, which keeps its extension folders busy. */
const VSCODE_APP_COMMAND = '/Applications/Visual Studio Code.app/Contents/MacOS/Electron';

/** The image path of VS Code's app on Windows, which keeps its extension folders busy. */
const VSCODE_WINDOWS_IMAGE_PATH =
  'C:\\Users\\tester\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';

/** The processes of a running VS Code, in the form the host lists them. */
export const runningVscodeProcesses: RunningProcesses =
  process.platform === 'win32'
    ? buildRunningImagePaths([VSCODE_WINDOWS_IMAGE_PATH])
    : buildRunningCommandLines([VSCODE_APP_COMMAND]);

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

export function buildVscodeExtensionsPath(params: { home: HomeFolder }): AbsolutePath {
  return joinBelowHome({ home: params.home, path: '.vscode/extensions' });
}

/** VS Code's folder of profiles where the host's platform keeps it. */
export function buildVscodeProfilesPath(params: { environment: Environment }): AbsolutePath {
  return resolveEnvironmentLocation({
    folders: params.environment,
    location: hostPlatform.explore.vscodeProfilesRoot,
  });
}

/**
 * A registry as VS Code writes it: one entry per folder with its `location` URI, and in the
 * current form also its `relativeLocation`.
 */
export function buildVscodeRegistryText(params: {
  pathRules: PathRules;
  extensionsPath: AbsolutePath;
  folderNames: string[];
  form: 'current' | 'locationOnly';
}): string {
  const entries = params.folderNames.map((folderName) => {
    const folderPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.extensionsPath,
      names: [folderName],
    });
    const uriPath = buildLocationUriPath({ pathRules: params.pathRules, folderPath: folderPath });
    const [extensionId, version] = folderName.split(/-(?=\d)/);
    const entry = {
      identifier: { id: extensionId },
      version: version?.split('-')[0],
      location: {
        $mid: 1,
        fsPath: folderPath,
        external: `file://${uriPath}`,
        path: uriPath,
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

/** The path of a folder's `file:` URI: on Windows `/c:/Users/…`, as VS Code writes it. */
function buildLocationUriPath(params: { pathRules: PathRules; folderPath: AbsolutePath }): string {
  switch (params.pathRules.rootForm) {
    case 'posix':
      return params.folderPath;
    case 'win32':
      return `/${params.folderPath.charAt(0).toLowerCase()}${params.folderPath.slice(1).replaceAll('\\', '/')}`;
  }
}

export function buildVscodeObsoleteText(params: { folderNames: string[] }): string {
  return JSON.stringify(Object.fromEntries(params.folderNames.map((name) => [name, true])));
}

/** Creates each extension folder with one file of `VSCODE_FOLDER_SIZE_BYTES`. */
export async function createVscodeExtensionFolders(params: {
  home: HomeFolder;
  folderNames: string[];
}): Promise<void> {
  for (const folderName of params.folderNames) {
    await createFixtureFile({
      path: joinAbsolutePath({
        rules: params.home.pathRules,
        parentPath: buildVscodeExtensionsPath({ home: params.home }),
        names: [folderName, 'package.json'],
      }),
      sizeBytes: VSCODE_FOLDER_SIZE_BYTES,
      modifiedMs: Date.UTC(2026, 0, 1),
    });
  }
}

/**
 * The installation every test starts from: every folder above, the default registry listing the
 * epsilon, a profile listing the current beta and gamma by location only, and `.obsolete`
 * marking alpha 1.0.0 and gamma.
 */
export async function createVscodeInstallation(params: {
  environment: Environment;
}): Promise<void> {
  const extensionsPath = buildVscodeExtensionsPath({ home: params.environment });

  await createVscodeExtensionFolders({
    home: params.environment,
    folderNames: [
      OBSOLETE_FOLDER_NAME,
      DEFAULT_LISTED_FOLDER_NAME,
      OLDER_FOLDER_NAME,
      BETA_CURRENT_FOLDER_NAME,
      LISTED_OBSOLETE_FOLDER_NAME,
      STRAY_FOLDER_NAME,
    ],
  });
  await writeFixtureTextFile({
    path: joinAbsolutePath({
      rules: params.environment.pathRules,
      parentPath: extensionsPath,
      names: ['extensions.json'],
    }),
    text: buildVscodeRegistryText({
      pathRules: params.environment.pathRules,
      extensionsPath: extensionsPath,
      folderNames: [DEFAULT_LISTED_FOLDER_NAME],
      form: 'current',
    }),
  });
  await writeFixtureTextFile({
    path: joinAbsolutePath({
      rules: params.environment.pathRules,
      parentPath: buildVscodeProfilesPath({ environment: params.environment }),
      names: [FIXTURE_PROFILE_ID, 'extensions.json'],
    }),
    text: buildVscodeRegistryText({
      pathRules: params.environment.pathRules,
      extensionsPath: extensionsPath,
      folderNames: [BETA_CURRENT_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME],
      form: 'locationOnly',
    }),
  });
  await writeFixtureTextFile({
    path: joinAbsolutePath({
      rules: params.environment.pathRules,
      parentPath: extensionsPath,
      names: ['.obsolete'],
    }),
    text: buildVscodeObsoleteText({
      folderNames: [OBSOLETE_FOLDER_NAME, LISTED_OBSOLETE_FOLDER_NAME],
    }),
  });
}

export function buildObsoleteVscodeUnit(params: {
  home: HomeFolder;
}): ExplorePathUnitVscodeExtension {
  return {
    kind: 'vscodeExtension',
    folderPath: joinAbsolutePath({
      rules: params.home.pathRules,
      parentPath: buildVscodeExtensionsPath({ home: params.home }),
      names: [OBSOLETE_FOLDER_NAME],
    }),
    extensionId: 'example.alpha',
    version: '1.0.0',
    reason: 'obsolete',
  };
}

export function buildOlderVscodeUnit(params: { home: HomeFolder }): ExplorePathUnitVscodeExtension {
  return {
    kind: 'vscodeExtension',
    folderPath: joinAbsolutePath({
      rules: params.home.pathRules,
      parentPath: buildVscodeExtensionsPath({ home: params.home }),
      names: [OLDER_FOLDER_NAME],
    }),
    extensionId: 'example.beta',
    version: '2.0.0',
    reason: 'olderVersion',
  };
}

/** The obsolete folder's item as the scan offers it, with a made-up identity. */
export function buildTestVscodeExtensionCandidate(params: { home: HomeFolder }): CandidateProbed {
  const unit = buildObsoleteVscodeUnit(params);

  return buildTestProbedCandidate({
    path: unit.folderPath,
    title: 'VS Code extension example.alpha 1.0.0',
    category: 'developer',
    risk: 'review',
    explanation: 'An extension folder VS Code marked for removal after an uninstall or an update.',
    regeneration: 'VS Code downloads it again only if you install this version again.',
    allocatedBytes: VSCODE_FOLDER_SIZE_BYTES,
    entryCount: 2,
    probe: 'vscodeExtensions',
    removal: {
      kind: 'deleteUnitPaths',
      targets: [
        { path: unit.folderPath, identity: buildTestIdentity({ realPath: unit.folderPath }) },
      ],
      unit: unit,
    },
    evidenceLines: [
      "Neither VS Code's default registry nor any profile's lists this folder.",
      "VS Code's .obsolete file marks it for removal.",
    ],
  });
}
