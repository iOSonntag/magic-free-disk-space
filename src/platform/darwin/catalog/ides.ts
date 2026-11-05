import type { CatalogEntry } from '../../../catalog/catalog.js';
import { buildBundleIdOwner } from './buildBundleIdOwner.js';

/** Code editors, such as Visual Studio Code, their caches and their extensions. */
export const IDE_ENTRIES: CatalogEntry[] = [
  {
    id: 'vscode-cache',
    category: 'caches',
    title: 'Visual Studio Code cache',
    explanation: 'Pages and images that Visual Studio Code keeps to show them faster.',
    regeneration: 'Visual Studio Code fills it again while it runs.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Code/Cache',
    scope: 'self',
    ageRule: 'none',
    owner: buildBundleIdOwner({ text: 'com.microsoft.VSCode' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'vscode-cached-data',
    category: 'caches',
    title: 'Visual Studio Code startup cache',
    explanation: 'Files that Visual Studio Code keeps so it starts faster.',
    regeneration: 'Visual Studio Code makes them again the next time it starts.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Code/CachedData',
    scope: 'self',
    ageRule: 'none',
    owner: buildBundleIdOwner({ text: 'com.microsoft.VSCode' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'vscode-extension-downloads',
    category: 'caches',
    title: 'Visual Studio Code extension downloads',
    explanation: 'Copies of the extensions that Visual Studio Code downloaded to install them.',
    regeneration: 'They are downloaded again when an extension updates.',
    risk: 'review',
    root: 'home',
    path: 'Library/Application Support/Code/CachedExtensionVSIXs',
    scope: 'self',
    ageRule: 'none',
    owner: buildBundleIdOwner({ text: 'com.microsoft.VSCode' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'vscode-extensions',
    category: 'developer',
    title: 'Visual Studio Code extensions',
    explanation:
      'Add-ons you installed in Visual Studio Code. Uninstall the ones you no longer use in its Extensions view.',
    regeneration: 'An uninstalled extension comes back when you install it again.',
    risk: 'review',
    root: 'home',
    path: '.vscode/extensions',
    scope: 'self',
    ageRule: 'none',
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'vscodeExtensions',
      advice:
        'Add-ons you installed in Visual Studio Code. Uninstall the ones you no longer use in its Extensions view.',
    },
  },
];
