import { toComparablePathText } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { Risk } from './catalog.js';

/** A file of the project folder named exactly `name`, such as `Cargo.toml`. */
export type ProjectMarkerFileName = { kind: 'fileName'; name: string };

/** A file of the project folder whose name ends in `suffix`, such as any `*.tf`. */
export type ProjectMarkerFileSuffix = { kind: 'fileSuffix'; suffix: string };

export type ProjectMarker = ProjectMarkerFileName | ProjectMarkerFileSuffix;

export type ProjectArtifactRule = {
  artifactName: string;
  /** The artifact counts only when its project folder holds a file one of these matches. */
  markers: ProjectMarker[];
  /**
   * What the project search does with a folder of this name beside no marker: `skipped` for a name
   * only build tools use, `walked` for a common name such as `bin`, which is then an ordinary
   * folder.
   */
  unmarkedFolder: 'skipped' | 'walked';
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
};

function buildFileNameMarkers(names: string[]): ProjectMarker[] {
  return names.map((name) => ({ kind: 'fileName', name: name }));
}

const PYTHON_PROJECT_MARKERS = buildFileNameMarkers([
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'requirements.txt',
]);

const NODE_PROJECT_MARKERS = buildFileNameMarkers(['package.json']);

export const PROJECT_ARTIFACT_RULES: ProjectArtifactRule[] = [
  {
    artifactName: 'node_modules',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Node.js dependencies',
    explanation: 'Installed packages of a Node.js project.',
    regeneration: 'Reinstall with the project package manager (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.next',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Next.js build output',
    explanation: 'Build output and cache of a Next.js project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.turbo',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Turborepo cache',
    explanation: 'Task cache of a Turborepo workspace.',
    regeneration: 'Rebuilt by the next turbo run.',
    risk: 'safe',
  },
  {
    artifactName: '.parcel-cache',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Parcel cache',
    explanation: 'Build cache of a Parcel project.',
    regeneration: 'Rebuilt by the next Parcel build.',
    risk: 'safe',
  },
  {
    artifactName: '.svelte-kit',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'SvelteKit build output',
    explanation: 'Generated files and build output of a SvelteKit project.',
    regeneration: 'Rebuilt by the next dev run or build.',
    risk: 'safe',
  },
  {
    artifactName: '.nuxt',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Nuxt build output',
    explanation: 'Generated files and build output of a Nuxt project.',
    regeneration: 'Rebuilt by the next dev run or build.',
    risk: 'safe',
  },
  {
    artifactName: '.angular',
    markers: NODE_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Angular build cache',
    explanation: 'Build cache of an Angular project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.sst',
    markers: buildFileNameMarkers(['sst.config.ts']),
    unmarkedFolder: 'skipped',
    title: 'SST build output',
    explanation: 'Build output and local state that SST keeps in a project.',
    regeneration: 'Rebuilt by the next sst dev or deploy.',
    risk: 'safe',
  },
  {
    artifactName: 'target',
    markers: buildFileNameMarkers(['Cargo.toml']),
    unmarkedFolder: 'skipped',
    title: 'Rust build output',
    explanation: 'Compiled output of a Rust project.',
    regeneration: 'Rebuilt by the next cargo build.',
    risk: 'safe',
  },
  {
    artifactName: 'build',
    markers: buildFileNameMarkers(['build.gradle', 'build.gradle.kts', 'pubspec.yaml']),
    unmarkedFolder: 'skipped',
    title: 'Gradle or Flutter build output',
    explanation: 'Compiled output of a Gradle, Android, or Flutter project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.build',
    markers: buildFileNameMarkers(['Package.swift']),
    unmarkedFolder: 'skipped',
    title: 'Swift package build output',
    explanation: 'Compiled output and checked-out packages of a Swift package.',
    regeneration: 'Rebuilt by the next swift build.',
    risk: 'safe',
  },
  {
    artifactName: '.gradle',
    markers: buildFileNameMarkers(['settings.gradle', 'settings.gradle.kts']),
    unmarkedFolder: 'skipped',
    title: 'Gradle project cache',
    explanation: 'Task and build caches that Gradle keeps in a project.',
    regeneration: 'Rebuilt by the next Gradle build.',
    risk: 'safe',
  },
  {
    artifactName: 'Pods',
    markers: buildFileNameMarkers(['Podfile']),
    unmarkedFolder: 'skipped',
    title: 'CocoaPods dependencies',
    explanation: 'Installed libraries of an Xcode project that uses CocoaPods.',
    regeneration: 'Reinstall with pod install (may need network).',
    risk: 'review',
  },
  {
    artifactName: 'vendor',
    markers: buildFileNameMarkers(['composer.json']),
    unmarkedFolder: 'skipped',
    title: 'PHP dependencies',
    explanation: 'Installed packages of a PHP project that uses Composer.',
    regeneration: 'Reinstall with composer install (may need network).',
    risk: 'review',
  },
  {
    artifactName: '.terraform',
    markers: [{ kind: 'fileSuffix', suffix: '.tf' }],
    unmarkedFolder: 'skipped',
    title: 'Terraform providers and modules',
    explanation: 'Providers and modules that Terraform downloaded for a project.',
    regeneration: 'Downloaded again by terraform init (needs network).',
    risk: 'review',
  },
  {
    artifactName: '_build',
    markers: buildFileNameMarkers(['mix.exs']),
    unmarkedFolder: 'skipped',
    title: 'Elixir build output',
    explanation: 'Compiled output of an Elixir project.',
    regeneration: 'Rebuilt by mix compile.',
    risk: 'safe',
  },
  {
    artifactName: '.dart_tool',
    markers: buildFileNameMarkers(['pubspec.yaml']),
    unmarkedFolder: 'skipped',
    title: 'Dart tool cache',
    explanation: 'Tool state and build cache of a Dart or Flutter project.',
    regeneration: 'Rebuilt by dart pub get or flutter run.',
    risk: 'safe',
  },
  {
    artifactName: '.stack-work',
    markers: buildFileNameMarkers(['stack.yaml']),
    unmarkedFolder: 'skipped',
    title: 'Haskell build output',
    explanation: 'Build output of a Haskell Stack project.',
    regeneration: 'Rebuilt by stack build.',
    risk: 'safe',
  },
  {
    artifactName: '.venv',
    markers: buildFileNameMarkers(['pyproject.toml', 'requirements.txt', 'setup.py']),
    unmarkedFolder: 'skipped',
    title: 'Python virtual environment',
    explanation: 'Installed packages of a Python project.',
    regeneration: 'Recreate with python -m venv and reinstall (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.pytest_cache',
    markers: PYTHON_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'pytest cache',
    explanation: 'Test cache of a Python project.',
    regeneration: 'Rebuilt by the next test run.',
    risk: 'safe',
  },
  {
    artifactName: '.mypy_cache',
    markers: PYTHON_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'mypy cache',
    explanation: 'Type-check cache of a Python project.',
    regeneration: 'Rebuilt by the next mypy run.',
    risk: 'safe',
  },
  {
    artifactName: '.ruff_cache',
    markers: PYTHON_PROJECT_MARKERS,
    unmarkedFolder: 'skipped',
    title: 'Ruff cache',
    explanation: 'Lint cache of a Python project.',
    regeneration: 'Rebuilt by the next ruff run.',
    risk: 'safe',
  },
];

/** The folder is the artifact of `rule`, the first rule of its name whose marker stands beside it. */
type ArtifactFolderMatchArtifact = { kind: 'artifact'; rule: ProjectArtifactRule };

/**
 * Rules name the folder, yet no marker of theirs stands beside it: `skipped` when one of them
 * skips such a folder, else `walked`.
 */
type ArtifactFolderMatchUnmarked = {
  kind: 'unmarked';
  unmarkedFolder: ProjectArtifactRule['unmarkedFolder'];
};

/** No rule names the folder. */
type ArtifactFolderMatchNoRule = { kind: 'noRule' };

/** What the artifact rules make of a folder, by its name and the names beside it. */
type ArtifactFolderMatch =
  | ArtifactFolderMatchArtifact
  | ArtifactFolderMatchUnmarked
  | ArtifactFolderMatchNoRule;

/** Matches folders to the artifact rules it was built from, under the path rules it was built for. */
type ArtifactFolderMatcher = {
  /**
   * What the rules make of the folder named `name`, whose project folder holds `siblingNames`,
   * the folder's own name among them.
   */
  matchFolder: (params: { name: string; siblingNames: ReadonlySet<string> }) => ArtifactFolderMatch;
};

/** The rules by their artifact name in the form `pathRules` compare names in, each in its order. */
type ArtifactRulesByName = Map<string, ProjectArtifactRule[]>;

/**
 * Builds the matcher of a walk, its rules grouped once by their names compared as `pathRules`
 * compare names, so `Bin` beside `Foo.CSPROJ` is the artifact of `bin` on Windows and of no rule
 * on POSIX.
 */
export function buildArtifactFolderMatcher(params: {
  pathRules: PathRules;
  rules: ProjectArtifactRule[];
}): ArtifactFolderMatcher {
  const rulesByName: ArtifactRulesByName = Map.groupBy(params.rules, (rule) =>
    toComparablePathText({ rules: params.pathRules, text: rule.artifactName }),
  );

  function matchFolder(folder: {
    name: string;
    siblingNames: ReadonlySet<string>;
  }): ArtifactFolderMatch {
    const nameRules = rulesByName.get(
      toComparablePathText({ rules: params.pathRules, text: folder.name }),
    );

    if (nameRules === undefined) {
      return { kind: 'noRule' };
    }

    const markedRule = findMarkedArtifactRule({
      pathRules: params.pathRules,
      nameRules: nameRules,
      projectEntryNames: folder.siblingNames,
    });

    if (markedRule !== null) {
      return { kind: 'artifact', rule: markedRule };
    }

    return {
      kind: 'unmarked',
      unmarkedFolder: nameRules.some((rule) => rule.unmarkedFolder === 'skipped')
        ? 'skipped'
        : 'walked',
    };
  }

  return { matchFolder: matchFolder };
}

/**
 * The first of the rules of a folder's name whose marker its project folder holds, by the names
 * of its entries; `null` when none does.
 */
function findMarkedArtifactRule(params: {
  pathRules: PathRules;
  nameRules: ProjectArtifactRule[];
  projectEntryNames: ReadonlySet<string>;
}): ProjectArtifactRule | null {
  const comparableEntryNames = new Set(
    [...params.projectEntryNames].map((entryName) =>
      toComparablePathText({ rules: params.pathRules, text: entryName }),
    ),
  );
  const markedRule = params.nameRules.find((rule) =>
    rule.markers.some((marker) =>
      isProjectMarkerPresent({
        pathRules: params.pathRules,
        marker: marker,
        comparableEntryNames: comparableEntryNames,
      }),
    ),
  );

  return markedRule ?? null;
}

/** Whether the project folder, by the names of its entries, holds one the marker matches. */
function isProjectMarkerPresent(params: {
  pathRules: PathRules;
  marker: ProjectMarker;
  comparableEntryNames: ReadonlySet<string>;
}): boolean {
  switch (params.marker.kind) {
    case 'fileName':
      return params.comparableEntryNames.has(
        toComparablePathText({ rules: params.pathRules, text: params.marker.name }),
      );
    case 'fileSuffix': {
      const suffix = toComparablePathText({ rules: params.pathRules, text: params.marker.suffix });

      return [...params.comparableEntryNames].some(
        (name) => name.length > suffix.length && name.endsWith(suffix),
      );
    }
  }
}
