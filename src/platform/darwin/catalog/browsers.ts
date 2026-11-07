import type { CatalogEntry, CatalogSelectionProfileFolders } from '../../../catalog/catalog.js';
import { buildBundleIdOwner } from './buildBundleIdOwner.js';

/**
 * The caches inside one profile of a Chromium browser, a folder holding `Preferences`. Cookies,
 * Local Storage and IndexedDB hold the person's logins and site data, so none is listed.
 */
const CHROMIUM_PROFILE_SUBPATHS = [
  'Code Cache',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Service Worker/CacheStorage',
  'Service Worker/ScriptCache',
];

/** The caches a Chromium browser shares across its profiles, beside them in its user data folder. */
const CHROMIUM_USER_DATA_SUBPATHS = [
  'ShaderCache',
  'GrShaderCache',
  'GraphiteDawnCache',
  'GPUPersistentCache',
  'component_crx_cache',
  'Crashpad/completed',
];

/** A Chromium user data folder: its shared caches, and each profile's caches. */
const chromiumUserDataCaches: CatalogSelectionProfileFolders = {
  kind: 'profileFolders',
  markerName: 'Preferences',
  subpaths: CHROMIUM_PROFILE_SUBPATHS,
  rootSubpaths: CHROMIUM_USER_DATA_SUBPATHS,
};

/** A folder holding only profiles, such as Opera's further profiles. */
const chromiumProfileCaches: CatalogSelectionProfileFolders = {
  kind: 'profileFolders',
  markerName: 'Preferences',
  subpaths: CHROMIUM_PROFILE_SUBPATHS,
  rootSubpaths: [],
};

const CHROMIUM_PROFILE_REGENERATION = 'The browser makes them again while you browse.';

/** The caches of web browsers, each Chromium browser's for every one of its profiles. */
export const BROWSER_ENTRIES: CatalogEntry[] = [
  {
    id: 'brave-cache',
    category: 'caches',
    title: 'Brave browser cache',
    explanation: 'Pages and images that Brave keeps to load websites faster.',
    regeneration: 'Brave fills it again while you browse.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/BraveSoftware/Brave-Browser',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.brave.Browser' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'chrome-cache',
    category: 'caches',
    title: 'Chrome browser cache',
    explanation: 'Pages and images that Chrome keeps to load websites faster.',
    regeneration: 'Chrome fills it again while you browse.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/Google/Chrome',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.google.Chrome' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'chrome-profile-caches',
    category: 'caches',
    title: 'Chrome profile caches',
    explanation:
      'Graphics, website code and crash reports that Chrome keeps to show pages faster, for one of your Chrome profiles or for all of them together. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Google/Chrome',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.google.Chrome' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'chrome-on-device-model',
    category: 'caches',
    title: 'Chrome built-in AI model',
    explanation:
      'The AI model that Chrome downloads to run features such as writing help on your Mac.',
    regeneration: 'Chrome downloads it again when a feature needs it.',
    risk: 'review',
    root: 'home',
    path: 'Library/Application Support/Google/Chrome/OptGuideOnDeviceModel',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.google.Chrome' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'chrome-model-store',
    category: 'caches',
    title: 'Chrome helper models',
    explanation: 'Small AI models that Chrome downloads to suggest and sort things for you.',
    regeneration: 'Chrome downloads them again when it needs them.',
    risk: 'review',
    root: 'home',
    path: 'Library/Application Support/Google/Chrome/optimization_guide_model_store',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.google.Chrome' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'edge-profile-caches',
    category: 'caches',
    title: 'Microsoft Edge profile caches',
    explanation:
      'Graphics, website code and crash reports that Edge keeps to show pages faster, for one of your Edge profiles or for all of them together. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Microsoft Edge',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.microsoft.edgemac' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'brave-profile-caches',
    category: 'caches',
    title: 'Brave profile caches',
    explanation:
      'Graphics, website code and crash reports that Brave keeps to show pages faster, for one of your Brave profiles or for all of them together. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/BraveSoftware/Brave-Browser',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.brave.Browser' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'arc-profile-caches',
    category: 'caches',
    title: 'Arc profile caches',
    explanation:
      'Graphics, website code and crash reports that Arc keeps to show pages faster, for one of your Arc profiles or for all of them together. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Arc/User Data',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'company.thebrowser.Browser' }),
    removal: { kind: 'delete' },
  },
  {
    // Opera keeps its first profile in this folder itself, which the selection takes as a profile.
    id: 'opera-profile-caches',
    category: 'caches',
    title: 'Opera profile caches',
    explanation:
      'Graphics, website code and crash reports that Opera keeps to show pages faster, for your Opera profile and for Opera as a whole. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/com.operasoftware.Opera',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.operasoftware.Opera' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'opera-side-profile-caches',
    category: 'caches',
    title: 'Opera extra profile caches',
    explanation:
      'Graphics and website code that Opera keeps for one of your other Opera profiles to show pages faster. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/com.operasoftware.Opera/_side_profiles',
    selection: chromiumProfileCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.operasoftware.Opera' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'vivaldi-profile-caches',
    category: 'caches',
    title: 'Vivaldi profile caches',
    explanation:
      'Graphics, website code and crash reports that Vivaldi keeps to show pages faster, for one of your Vivaldi profiles or for all of them together. Your history, passwords and logins stay.',
    regeneration: CHROMIUM_PROFILE_REGENERATION,
    risk: 'safe',
    root: 'home',
    path: 'Library/Application Support/Vivaldi',
    selection: chromiumUserDataCaches,
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'com.vivaldi.Vivaldi' }),
    removal: { kind: 'delete' },
  },
  {
    id: 'firefox-profile-caches',
    category: 'caches',
    title: 'Firefox profile caches',
    explanation:
      'Pages and images that Firefox keeps for one of your Firefox profiles to load websites faster. Your history, passwords and logins stay.',
    regeneration: 'Firefox fills it again while you browse.',
    risk: 'safe',
    root: 'home',
    // On macOS Firefox keeps each profile's `cache2` here, never beside the profile itself.
    path: 'Library/Caches/Firefox/Profiles',
    selection: {
      kind: 'profileFolders',
      markerName: 'cache2',
      subpaths: ['cache2'],
      rootSubpaths: [],
    },
    ageRule: { kind: 'none' },
    owner: buildBundleIdOwner({ text: 'org.mozilla.firefox' }),
    removal: { kind: 'delete' },
  },
];
