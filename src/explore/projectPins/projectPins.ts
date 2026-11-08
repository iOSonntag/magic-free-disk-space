import { isSameEntryName, toComparablePathText } from '../../path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { ReadFailure } from '../../system/readFailure.js';
import type { ExploreFileReadText, ExploreFileReadUnfit } from '../loadExploreRead.js';

/** What a pin file pins, decided by its name; each kind of unit selects its pins by these kinds. */
export type ProjectPinFileKind =
  | 'toolVersions'
  | 'nvmrc'
  | 'gradle'
  | 'packageJson'
  | 'miseConfig'
  | 'rustToolchain'
  | 'fvmrc'
  /** An Android project's `local.properties`, whose `sdk.dir` names the SDK it builds with. */
  | 'androidLocalProperties';

/** A pin file the project walk or mise's tracked configs found, with its kind matched once. */
export type ProjectPinFileRef = { path: AbsolutePath; kind: ProjectPinFileKind };

export type ProjectPinFileContentUnreadable = { kind: 'unreadable'; failure: ReadFailure };

export type ProjectPinFileContent =
  | ExploreFileReadText
  | ExploreFileReadUnfit
  | ProjectPinFileContentUnreadable;

/** A pin file as its read found it; a file that is gone has none. */
export type ProjectPinFile = ProjectPinFileRef & { content: ProjectPinFileContent };

/** A pin file whose text was read. */
export type ProjectPinFileText = ProjectPinFileRef & { text: string };

/** The pin files a scan found; `isWalkComplete` is false when the walk stopped or skipped folders. */
export type ProjectPins = { files: ProjectPinFile[]; isWalkComplete: boolean };

/** Where a pin file was found: in the project walk, or as a link in mise's tracked configs. */
export type ProjectPinFileSource = 'walk' | 'miseTrackedConfig';

/** Each kind of pin file that its name alone decides, by the names it goes by. */
const pinFileNames: { kind: ProjectPinFileKind; names: string[] }[] = [
  { kind: 'toolVersions', names: ['.tool-versions'] },
  { kind: 'nvmrc', names: ['.nvmrc'] },
  { kind: 'gradle', names: ['build.gradle', 'build.gradle.kts'] },
  { kind: 'packageJson', names: ['package.json'] },
  { kind: 'rustToolchain', names: ['rust-toolchain.toml', 'rust-toolchain'] },
  { kind: 'fvmrc', names: ['.fvmrc'] },
  { kind: 'androidLocalProperties', names: ['local.properties'] },
  { kind: 'miseConfig', names: ['mise.toml', '.mise.toml', 'mise.local.toml', '.mise.local.toml'] },
];

const PNPM_LOCK_FILE_NAME = 'pnpm-lock.yaml';

const TOML_SUFFIX = '.toml';

/**
 * The kind of the pin file named `name`, or `null` for a file that pins nothing. A `package.json`
 * pins only beside a `pnpm-lock.yaml`; any `*.toml` mise tracks is a mise config. Names compare
 * as `pathRules` compare them.
 */
export function matchProjectPinFile(params: {
  pathRules: PathRules;
  name: string;
  siblingNames: ReadonlySet<string>;
  source: ProjectPinFileSource;
}): ProjectPinFileKind | null {
  const kind = matchProjectPinFileName({
    pathRules: params.pathRules,
    name: params.name,
    source: params.source,
  });

  if (kind !== 'packageJson') {
    return kind;
  }

  const hasPnpmLockFile = [...params.siblingNames].some((siblingName) =>
    isSameEntryName({ rules: params.pathRules, name: PNPM_LOCK_FILE_NAME, otherName: siblingName }),
  );

  return hasPnpmLockFile ? kind : null;
}

/**
 * The kind of pin file that `name` may be, whatever lies beside it, or `null` for a name that
 * never pins: a `package.json` here may still lack its `pnpm-lock.yaml`. Names compare as
 * `pathRules` compare them.
 */
export function matchProjectPinFileName(params: {
  pathRules: PathRules;
  name: string;
  source: ProjectPinFileSource;
}): ProjectPinFileKind | null {
  const named = pinFileNames.find((pinFile) =>
    pinFile.names.some((pinFileName) =>
      isSameEntryName({ rules: params.pathRules, name: pinFileName, otherName: params.name }),
    ),
  );

  if (named !== undefined) {
    return named.kind;
  }

  const comparableName = toComparablePathText({ rules: params.pathRules, text: params.name });
  const comparableSuffix = toComparablePathText({ rules: params.pathRules, text: TOML_SUFFIX });

  if (params.source === 'miseTrackedConfig' && comparableName.endsWith(comparableSuffix)) {
    return 'miseConfig';
  }

  return null;
}
