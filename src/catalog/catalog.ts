export type Risk = 'safe' | 'review' | 'careful' | 'never';

export type CandidateCategory =
  | 'temporary'
  | 'developer'
  | 'packages'
  | 'caches'
  | 'containers'
  | 'system'
  | 'trash'
  | 'projects'
  | 'applications'
  | 'leftovers'
  | 'userFiles';

export type CatalogRoot = 'home' | 'temp' | 'absolute';

export type CatalogRemovalDelete = { kind: 'delete' };

export type CatalogRemovalAdvice = { kind: 'advice'; advice: string };

/** The probes of tool-owned items; the explore module runs each one, and one entry names each. */
export type ExploreProbeId =
  | 'simulatorDevices'
  | 'dartPubCache'
  | 'miseVersions'
  | 'simulatorRuntimes'
  | 'androidAvds'
  | 'androidSystemImages'
  | 'androidEmulator'
  | 'homebrewAppleSilicon'
  | 'homebrewIntel'
  | 'vscodeExtensions'
  | 'asdfVersions'
  | 'nvmVersions'
  | 'androidPlatforms'
  | 'pnpmStores'
  | 'pnpmStoresXdg';

/** Offered as the units its probe finds; the advice stands when the probe cannot run. */
export type CatalogRemovalExplore = { kind: 'explore'; probe: ExploreProbeId; advice: string };

export type CatalogRemoval = CatalogRemovalDelete | CatalogRemovalAdvice | CatalogRemovalExplore;

export type CatalogEntry = {
  id: string;
  category: CandidateCategory;
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
  root: CatalogRoot;
  /** Relative to the root for home and temp; the full path for absolute. */
  path: string;
  /** self: the path itself; children: each entry directly inside it. */
  scope: 'self' | 'children';
  ageRule: 'none' | 'staleDays';
  /** Bundle id of the app that owns the data; a running app withholds it. */
  ownerBundleId: string | null;
  removal: CatalogRemoval;
};
