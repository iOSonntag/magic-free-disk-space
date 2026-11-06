import type { CatalogEntry } from '../../../catalog/catalog.js';

/** Programming languages: their installed versions and the files their tools keep. */
export const LANGUAGE_ENTRIES: CatalogEntry[] = [
  {
    id: 'dart-analysis-cache',
    category: 'developer',
    title: 'Dart code checker cache',
    explanation:
      'Files the Dart code checker keeps while you edit code. Close code editors that use Dart first.',
    regeneration: 'The checker makes them again the next time it checks code.',
    risk: 'review',
    root: 'home',
    path: '.dartServer/.analysis-driver',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'node-gyp-cache',
    category: 'packages',
    title: 'Node.js build files',
    explanation: 'Files that Node.js downloads to build some of its add-ons.',
    regeneration: 'They are downloaded again when an add-on needs them.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/node-gyp',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'nvm-node-versions',
    category: 'developer',
    title: 'Node.js versions from nvm',
    explanation: 'Versions of Node.js installed with nvm. Keep the one you use.',
    regeneration: 'A removed version comes back when you install it again with nvm.',
    risk: 'review',
    root: 'home',
    path: '.nvm/versions/node',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'nvmVersions',
      advice:
        'Keep the version you use (`nvm current`) and remove the others with `nvm uninstall <version>`.',
    },
  },
  {
    id: 'asdf-installs',
    category: 'developer',
    title: 'Tool versions from asdf',
    explanation:
      'Versions of programming tools installed with asdf. Remove the ones you no longer use.',
    regeneration: 'A removed version comes back when you install it again with asdf.',
    risk: 'review',
    root: 'home',
    path: '.asdf/installs',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'asdfVersions',
      advice: 'Remove tool versions you no longer use with `asdf uninstall <tool> <version>`.',
    },
  },
  {
    id: 'mise-installs',
    category: 'developer',
    title: 'Tool versions from mise',
    explanation:
      'Versions of programming tools installed with mise. Remove the ones you no longer use.',
    regeneration: 'A removed version comes back when you install it again with mise.',
    risk: 'review',
    root: 'home',
    path: '.local/share/mise/installs',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'miseVersions',
      advice:
        'Remove tool versions you no longer use with `mise uninstall <tool>@<version>` or `mise prune`.',
    },
  },
];
