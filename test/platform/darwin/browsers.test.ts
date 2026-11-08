import { expect, test } from 'bun:test';
import { BROWSER_ENTRIES } from '../../../src/platform/darwin/catalog/browsers.js';
import { CATALOG_ENTRIES } from '../../../src/platform/darwin/catalogEntries.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import { buildRiskAndPathById } from './catalogPins.js';

/** The caches inside one Chromium profile. */
const CHROMIUM_PROFILE_CACHES = [
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Service Worker/CacheStorage',
  'Service Worker/ScriptCache',
];

/** The caches Chromium keeps in its user data folder, shared by every profile. */
const CHROMIUM_USER_DATA_CACHES = [
  'ShaderCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'GPUPersistentCache',
  'component_crx_cache',
  'Crashpad/completed',
];

/** The folders of a profile that hold the person's logins and the data of websites. */
const PROFILE_DATA_FOLDER_NAMES = ['Cookies', 'Local Storage', 'IndexedDB'];

const CHROMIUM_USER_DATA_ENTRIES: Record<string, string> = {
  'chrome-profile-caches': 'com.google.Chrome',
  'edge-profile-caches': 'com.microsoft.edgemac',
  'brave-profile-caches': 'com.brave.Browser',
  'arc-profile-caches': 'company.thebrowser.Browser',
  'opera-profile-caches': 'com.operasoftware.Opera',
  'vivaldi-profile-caches': 'com.vivaldi.Vivaldi',
};

describeAwaitingWin32Platform('BROWSER_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(BROWSER_ENTRIES)).toEqual({
      'brave-cache': ['safe', 'Library/Caches/BraveSoftware/Brave-Browser'],
      'chrome-cache': ['safe', 'Library/Caches/Google/Chrome'],
      'chrome-profile-caches': ['safe', 'Library/Application Support/Google/Chrome'],
      'chrome-on-device-model': [
        'review',
        'Library/Application Support/Google/Chrome/OptGuideOnDeviceModel',
      ],
      'chrome-model-store': [
        'review',
        'Library/Application Support/Google/Chrome/optimization_guide_model_store',
      ],
      'edge-profile-caches': ['safe', 'Library/Application Support/Microsoft Edge'],
      'brave-profile-caches': ['safe', 'Library/Application Support/BraveSoftware/Brave-Browser'],
      'arc-profile-caches': ['safe', 'Library/Application Support/Arc/User Data'],
      'opera-profile-caches': ['safe', 'Library/Application Support/com.operasoftware.Opera'],
      'opera-side-profile-caches': [
        'safe',
        'Library/Application Support/com.operasoftware.Opera/_side_profiles',
      ],
      'vivaldi-profile-caches': ['safe', 'Library/Application Support/Vivaldi'],
      'firefox-profile-caches': ['safe', 'Library/Caches/Firefox/Profiles'],
    });
  });

  test("each Chromium browser offers its profiles' caches and its user data folder's shared caches, safe and its own", () => {
    for (const [id, bundleId] of Object.entries(CHROMIUM_USER_DATA_ENTRIES)) {
      const entry = BROWSER_ENTRIES.find((candidate) => candidate.id === id);

      expect(entry).toMatchObject({
        risk: 'safe',
        owner: { app: { kind: 'bundleId', bundleId: bundleId } },
        selection: {
          kind: 'profileFolders',
          markerName: 'Preferences',
          subpaths: CHROMIUM_PROFILE_CACHES,
          rootSubpaths: CHROMIUM_USER_DATA_CACHES,
        },
      });
    }
  });

  test("Opera's further profiles offer only their own caches", () => {
    expect(BROWSER_ENTRIES.find((entry) => entry.id === 'opera-side-profile-caches')).toMatchObject(
      {
        risk: 'safe',
        selection: {
          kind: 'profileFolders',
          markerName: 'Preferences',
          subpaths: CHROMIUM_PROFILE_CACHES,
          rootSubpaths: [],
        },
      },
    );
  });

  test("Firefox's caches are taken from each profile's local folder, where Firefox keeps cache2", () => {
    const firefoxEntries = CATALOG_ENTRIES.filter(
      (entry) =>
        entry.owner?.app.kind === 'bundleId' && entry.owner.app.bundleId === 'org.mozilla.firefox',
    );

    expect(firefoxEntries).toHaveLength(1);
    expect(firefoxEntries[0]).toMatchObject({
      id: 'firefox-profile-caches',
      risk: 'safe',
      root: 'home',
      path: 'Library/Caches/Firefox/Profiles',
      selection: {
        kind: 'profileFolders',
        markerName: 'cache2',
        subpaths: ['cache2'],
        rootSubpaths: [],
      },
    });
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

  test("no entry's path or subpath names a folder of logins or website data", () => {
    const namingPaths = BROWSER_ENTRIES.flatMap((entry) => {
      const subpaths =
        entry.selection.kind === 'profileFolders'
          ? [...entry.selection.subpaths, ...entry.selection.rootSubpaths]
          : [];

      return [entry.path, ...subpaths].filter((path) =>
        path.split('/').some((name) => PROFILE_DATA_FOLDER_NAMES.includes(name)),
      );
    });

    expect(namingPaths).toEqual([]);
  });
});
