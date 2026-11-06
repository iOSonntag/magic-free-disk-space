import type { IdeVersionRoots } from '../../explore/explorePlatform.js';
import { stubPartNotBuilt } from '../../notBuilt.js';

/**
 * The folders of the JetBrains IDEs and Android Studio on macOS that hold one folder per version,
 * by kind. Part 4a settles them; until then no probe reads them.
 */
export const IDE_VERSION_ROOTS = stubPartNotBuilt<IdeVersionRoots>({
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
});
