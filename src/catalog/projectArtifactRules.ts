import type { Risk } from './catalog.js';

export type ProjectArtifactRule = {
  artifactName: string;
  /** The artifact counts only when its project folder holds one of these files. */
  markerNames: string[];
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
};

export const PROJECT_ARTIFACT_RULES: ProjectArtifactRule[] = [
  {
    artifactName: 'node_modules',
    markerNames: ['package.json'],
    title: 'Node.js dependencies',
    explanation: 'Installed packages of a Node.js project.',
    regeneration: 'Reinstall with the project package manager (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.next',
    markerNames: ['package.json'],
    title: 'Next.js build output',
    explanation: 'Build output and cache of a Next.js project.',
    regeneration: 'Rebuilt by the next build.',
    risk: 'safe',
  },
  {
    artifactName: '.turbo',
    markerNames: ['package.json'],
    title: 'Turborepo cache',
    explanation: 'Task cache of a Turborepo workspace.',
    regeneration: 'Rebuilt by the next turbo run.',
    risk: 'safe',
  },
  {
    artifactName: '.parcel-cache',
    markerNames: ['package.json'],
    title: 'Parcel cache',
    explanation: 'Build cache of a Parcel project.',
    regeneration: 'Rebuilt by the next Parcel build.',
    risk: 'safe',
  },
  {
    artifactName: '_build',
    markerNames: ['mix.exs'],
    title: 'Elixir build output',
    explanation: 'Compiled output of an Elixir project.',
    regeneration: 'Rebuilt by mix compile.',
    risk: 'safe',
  },
  {
    artifactName: '.dart_tool',
    markerNames: ['pubspec.yaml'],
    title: 'Dart tool cache',
    explanation: 'Tool state and build cache of a Dart or Flutter project.',
    regeneration: 'Rebuilt by dart pub get or flutter run.',
    risk: 'safe',
  },
  {
    artifactName: '.stack-work',
    markerNames: ['stack.yaml'],
    title: 'Haskell build output',
    explanation: 'Build output of a Haskell Stack project.',
    regeneration: 'Rebuilt by stack build.',
    risk: 'safe',
  },
  {
    artifactName: '.venv',
    markerNames: ['pyproject.toml', 'requirements.txt', 'setup.py'],
    title: 'Python virtual environment',
    explanation: 'Installed packages of a Python project.',
    regeneration: 'Recreate with python -m venv and reinstall (needs network).',
    risk: 'review',
  },
  {
    artifactName: '.pytest_cache',
    markerNames: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
    title: 'pytest cache',
    explanation: 'Test cache of a Python project.',
    regeneration: 'Rebuilt by the next test run.',
    risk: 'safe',
  },
  {
    artifactName: '.mypy_cache',
    markerNames: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
    title: 'mypy cache',
    explanation: 'Type-check cache of a Python project.',
    regeneration: 'Rebuilt by the next mypy run.',
    risk: 'safe',
  },
  {
    artifactName: '.ruff_cache',
    markerNames: ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'],
    title: 'Ruff cache',
    explanation: 'Lint cache of a Python project.',
    regeneration: 'Rebuilt by the next ruff run.',
    risk: 'safe',
  },
];
