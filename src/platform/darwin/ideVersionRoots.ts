import type { IdeVersionRoots } from '../../explore/explorePlatform.js';

/**
 * The folders of the JetBrains IDEs and Android Studio on macOS that hold one folder per version,
 * by kind: `~/Library/<kind>/<productVendor>/<dataDirectoryName>`, as the JetBrains launcher forms
 * them, with Google as Android Studio's vendor.
 */
export const IDE_VERSION_ROOTS: IdeVersionRoots = {
  caches: [
    ['Library', 'Caches', 'JetBrains'],
    ['Library', 'Caches', 'Google'],
  ],
  logs: [
    ['Library', 'Logs', 'JetBrains'],
    ['Library', 'Logs', 'Google'],
  ],
  settings: [
    ['Library', 'Application Support', 'JetBrains'],
    ['Library', 'Application Support', 'Google'],
  ],
};
