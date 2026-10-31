import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { ReadFailure } from '../../system/readFailure.js';

/** What a pin file pins, decided by its name; each kind of unit selects its pins by these kinds. */
export type ProjectPinFileKind = 'toolVersions' | 'nvmrc' | 'gradle' | 'packageJson' | 'miseConfig';

/** A pin file the project walk or mise's tracked configs found, with its kind matched once. */
export type ProjectPinFileRef = { path: AbsolutePath; kind: ProjectPinFileKind };

export type ProjectPinFileContentText = { kind: 'text'; text: string };

/** Something is there, but no file to read: another kind, or over the read limit. */
export type ProjectPinFileContentUnfit = { kind: 'unfit' };

export type ProjectPinFileContentUnreadable = { kind: 'unreadable'; failure: ReadFailure };

export type ProjectPinFileContent =
  | ProjectPinFileContentText
  | ProjectPinFileContentUnfit
  | ProjectPinFileContentUnreadable;

/** A pin file as its read found it; a file that is gone has none. */
export type ProjectPinFile = ProjectPinFileRef & { content: ProjectPinFileContent };

/** A pin file whose text was read. */
export type ProjectPinFileText = ProjectPinFileRef & { text: string };

/** The pin files a scan found; `isWalkComplete` is false when the walk stopped or skipped folders. */
export type ProjectPins = { files: ProjectPinFile[]; isWalkComplete: boolean };

/** Where a pin file was found: in the project walk, or as a link in mise's tracked configs. */
export type ProjectPinFileSource = 'walk' | 'miseTrackedConfig';

const MISE_CONFIG_FILE_NAMES = ['mise.toml', '.mise.toml', 'mise.local.toml', '.mise.local.toml'];

const GRADLE_BUILD_FILE_NAMES = ['build.gradle', 'build.gradle.kts'];

const PNPM_LOCK_FILE_NAME = 'pnpm-lock.yaml';

const TOML_SUFFIX = '.toml';

/**
 * The kind of the pin file named `name`, or `null` for a file that pins nothing. A `package.json`
 * pins only beside a `pnpm-lock.yaml`; any `*.toml` mise tracks is a mise config.
 */
export function matchProjectPinFile(params: {
  name: string;
  siblingNames: ReadonlySet<string>;
  source: ProjectPinFileSource;
}): ProjectPinFileKind | null {
  if (params.name === '.tool-versions') {
    return 'toolVersions';
  }

  if (params.name === '.nvmrc') {
    return 'nvmrc';
  }

  if (GRADLE_BUILD_FILE_NAMES.includes(params.name)) {
    return 'gradle';
  }

  if (params.name === 'package.json') {
    return params.siblingNames.has(PNPM_LOCK_FILE_NAME) ? 'packageJson' : null;
  }

  if (MISE_CONFIG_FILE_NAMES.includes(params.name)) {
    return 'miseConfig';
  }

  if (params.source === 'miseTrackedConfig' && params.name.endsWith(TOML_SUFFIX)) {
    return 'miseConfig';
  }

  return null;
}
