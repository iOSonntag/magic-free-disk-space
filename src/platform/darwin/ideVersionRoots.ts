import type { IdeVersionRoots } from '../../explore/explorePlatform.js';

/**
 * The folders of the JetBrains IDEs and Android Studio on macOS that hold one folder per version,
 * by kind: `~/Library/<kind>/<productVendor>/<dataDirectoryName>`, as the JetBrains launcher forms
 * them, with Google as Android Studio's vendor.
 */
export const IDE_VERSION_ROOTS: IdeVersionRoots = {
  caches: [
    { root: 'home', path: 'Library/Caches/JetBrains' },
    { root: 'home', path: 'Library/Caches/Google' },
  ],
  logs: [
    { root: 'home', path: 'Library/Logs/JetBrains' },
    { root: 'home', path: 'Library/Logs/Google' },
  ],
  settings: [
    { root: 'home', path: 'Library/Application Support/JetBrains' },
    { root: 'home', path: 'Library/Application Support/Google' },
  ],
};
