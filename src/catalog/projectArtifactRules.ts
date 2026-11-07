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
    title: 'Node.js dependencies',
    explanation: 'Installed packages of a Node.js project.',
    regeneration: 'Reinstall with the project package manager (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.next',
    markers: NODE_PROJECT_MARKERS,
    title: 'Next.js build output',
    explanation: 'Build output and cache of a Next.js project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.turbo',
    markers: NODE_PROJECT_MARKERS,
    title: 'Turborepo cache',
    explanation: 'Task cache of a Turborepo workspace.',
    regeneration: 'Rebuilt by the next turbo run.',
    risk: 'safe',
  },
  {
    artifactName: '.parcel-cache',
    markers: NODE_PROJECT_MARKERS,
    title: 'Parcel cache',
    explanation: 'Build cache of a Parcel project.',
    regeneration: 'Rebuilt by the next Parcel build.',
    risk: 'safe',
  },
  {
    artifactName: '.svelte-kit',
    markers: NODE_PROJECT_MARKERS,
    title: 'SvelteKit build output',
    explanation: 'Generated files and build output of a SvelteKit project.',
    regeneration: 'Rebuilt by the next dev run or build.',
    risk: 'safe',
  },
  {
    artifactName: '.nuxt',
    markers: NODE_PROJECT_MARKERS,
    title: 'Nuxt build output',
    explanation: 'Generated files and build output of a Nuxt project.',
    regeneration: 'Rebuilt by the next dev run or build.',
    risk: 'safe',
  },
  {
    artifactName: '.angular',
    markers: NODE_PROJECT_MARKERS,
    title: 'Angular build cache',
    explanation: 'Build cache of an Angular project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.sst',
    markers: buildFileNameMarkers(['sst.config.ts']),
    title: 'SST build output',
    explanation: 'Build output and local state that SST keeps in a project.',
    regeneration: 'Rebuilt by the next sst dev or deploy.',
    risk: 'safe',
  },
  {
    artifactName: 'target',
    markers: buildFileNameMarkers(['Cargo.toml']),
    title: 'Rust build output',
    explanation: 'Compiled output of a Rust project.',
    regeneration: 'Rebuilt by the next cargo build.',
    risk: 'safe',
  },
  {
    artifactName: 'build',
    markers: buildFileNameMarkers(['build.gradle', 'build.gradle.kts', 'pubspec.yaml']),
    title: 'Gradle or Flutter build output',
    explanation: 'Compiled output of a Gradle, Android, or Flutter project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.build',
    markers: buildFileNameMarkers(['Package.swift']),
    title: 'Swift package build output',
    explanation: 'Compiled output and checked-out packages of a Swift package.',
    regeneration: 'Rebuilt by the next swift build.',
    risk: 'safe',
  },
  {
    artifactName: '.gradle',
    markers: buildFileNameMarkers(['settings.gradle', 'settings.gradle.kts']),
    title: 'Gradle project cache',
    explanation: 'Task and build caches that Gradle keeps in a project.',
    regeneration: 'Rebuilt by the next Gradle build.',
    risk: 'safe',
  },
  {
    artifactName: 'Pods',
    markers: buildFileNameMarkers(['Podfile']),
    title: 'CocoaPods dependencies',
    explanation: 'Installed libraries of an Xcode project that uses CocoaPods.',
    regeneration: 'Reinstall with pod install (may need network).',
    risk: 'review',
  },
  {
    artifactName: 'vendor',
    markers: buildFileNameMarkers(['composer.json']),
    title: 'PHP dependencies',
    explanation: 'Installed packages of a PHP project that uses Composer.',
    regeneration: 'Reinstall with composer install (may need network).',
    risk: 'review',
  },
  {
    artifactName: '.terraform',
    markers: [{ kind: 'fileSuffix', suffix: '.tf' }],
    title: 'Terraform providers and modules',
    explanation: 'Providers and modules that Terraform downloaded for a project.',
    regeneration: 'Downloaded again by terraform init (needs network).',
    risk: 'review',
  },
  {
    artifactName: '_build',
    markers: buildFileNameMarkers(['mix.exs']),
    title: 'Elixir build output',
    explanation: 'Compiled output of an Elixir project.',
    regeneration: 'Rebuilt by mix compile.',
    risk: 'safe',
  },
  {
    artifactName: '.dart_tool',
    markers: buildFileNameMarkers(['pubspec.yaml']),
    title: 'Dart tool cache',
    explanation: 'Tool state and build cache of a Dart or Flutter project.',
    regeneration: 'Rebuilt by dart pub get or flutter run.',
    risk: 'safe',
  },
  {
    artifactName: '.stack-work',
    markers: buildFileNameMarkers(['stack.yaml']),
    title: 'Haskell build output',
    explanation: 'Build output of a Haskell Stack project.',
    regeneration: 'Rebuilt by stack build.',
    risk: 'safe',
  },
  {
    artifactName: '.venv',
    markers: buildFileNameMarkers(['pyproject.toml', 'requirements.txt', 'setup.py']),
    title: 'Python virtual environment',
    explanation: 'Installed packages of a Python project.',
    regeneration: 'Recreate with python -m venv and reinstall (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.pytest_cache',
    markers: PYTHON_PROJECT_MARKERS,
    title: 'pytest cache',
    explanation: 'Test cache of a Python project.',
    regeneration: 'Rebuilt by the next test run.',
    risk: 'safe',
  },
  {
    artifactName: '.mypy_cache',
    markers: PYTHON_PROJECT_MARKERS,
    title: 'mypy cache',
    explanation: 'Type-check cache of a Python project.',
    regeneration: 'Rebuilt by the next mypy run.',
    risk: 'safe',
  },
  {
    artifactName: '.ruff_cache',
    markers: PYTHON_PROJECT_MARKERS,
    title: 'Ruff cache',
    explanation: 'Lint cache of a Python project.',
    regeneration: 'Rebuilt by the next ruff run.',
    risk: 'safe',
  },
];

/**
 * The rule a folder named `name` is the artifact of, when its project folder, by the names of
 * its entries, holds one of the rule's markers; `null` when it is no artifact.
 */
export function findMarkedArtifactRule(params: {
  rules: ProjectArtifactRule[];
  name: string;
  projectEntryNames: ReadonlySet<string>;
}): ProjectArtifactRule | null {
  const markedRule = params.rules.find(
    (rule) =>
      rule.artifactName === params.name &&
      rule.markers.some((marker) =>
        isProjectMarkerPresent({ marker: marker, entryNames: params.projectEntryNames }),
      ),
  );

  return markedRule ?? null;
}

/** Whether the project folder, by the names of its entries, holds one the marker matches. */
function isProjectMarkerPresent(params: {
  marker: ProjectMarker;
  entryNames: ReadonlySet<string>;
}): boolean {
  switch (params.marker.kind) {
    case 'fileName':
      return params.entryNames.has(params.marker.name);
    case 'fileSuffix': {
      const suffix = params.marker.suffix;

      return [...params.entryNames].some(
        (name) => name.length > suffix.length && name.endsWith(suffix),
      );
    }
  }
}
