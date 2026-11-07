import { expect, test } from 'bun:test';
import { BROWSER_ENTRIES } from '../../../src/platform/darwin/catalog/browsers.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';

/** The caches Chromium keeps in its user data folder, shared by every profile. */
const CHROMIUM_USER_DATA_CACHES = [
  'ShaderCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'GPUPersistentCache',
  'component_crx_cache',
  'Crashpad/completed',
];

const CHROMIUM_USER_DATA_ENTRIES: Record<string, string> = {
  'chrome-profile-caches': 'com.google.Chrome',
  'edge-profile-caches': 'com.microsoft.edgemac',
  'brave-profile-caches': 'com.brave.Browser',
  'arc-profile-caches': 'company.thebrowser.Browser',
  'opera-profile-caches': 'com.operasoftware.Opera',
  'vivaldi-profile-caches': 'com.vivaldi.Vivaldi',
};

describeAwaitingWin32Platform('BROWSER_ENTRIES', () => {
  test("each Chromium browser offers its user data folder's shared caches, safe and its own", () => {
    for (const [id, bundleId] of Object.entries(CHROMIUM_USER_DATA_ENTRIES)) {
      const entry = BROWSER_ENTRIES.find((candidate) => candidate.id === id);

      expect(entry).toMatchObject({
        risk: 'safe',
        owner: { kind: 'bundleId', bundleId: bundleId },
        selection: { kind: 'profileFolders', rootSubpaths: CHROMIUM_USER_DATA_CACHES },
      });
    }
  });

  test('no profile lists a cache that Chromium keeps in the user data folder', () => {
    for (const entry of BROWSER_ENTRIES) {
      if (entry.selection.kind !== 'profileFolders') {
        continue;
      }

      for (const subpath of entry.selection.subpaths) {
        expect(CHROMIUM_USER_DATA_CACHES).not.toContain(subpath);
      }
    }
  });
});
