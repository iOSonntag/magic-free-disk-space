import type { CatalogOwner } from './catalogOwner.js';

export type Risk = 'safe' | 'review' | 'careful' | 'never';

export type CandidateCategory =
  | 'temporary'
  | 'developer'
  | 'packages'
  | 'caches'
  /** The app sandboxes in `~/Library/Containers`. */
  | 'appContainers'
  /** The images, containers, volumes and disks of Docker and the VM engines. */
  | 'containerEngines'
  | 'aiModels'
  | 'downloads'
  | 'installers'
  /** The local copies of iCloud Drive files, which an evict frees. */
  | 'cloudCopies'
  /** What only its own app removes safely, such as iPhone backups. */
  | 'appManaged'
  | 'system'
  | 'trash'
  | 'projects'
  | 'applications'
  | 'leftovers'
  | 'userFiles';

export type CatalogRoot = 'home' | 'temp' | 'absolute';

/** The apps an advice may open, by a key only the app maps to the app itself. */
export type OpenableApp =
  | 'photos'
  | 'messages'
  | 'music'
  | 'tv'
  | 'podcasts'
  | 'garageBand'
  | 'logicPro'
  | 'iMovie'
  | 'finalCutPro'
  | 'finder';

/** The panes of System Settings an advice may open, by a key only the app maps to the pane. */
export type SettingsPane = 'storage' | 'icloud' | 'timeMachine';

export type AdviceOpenerApp = { kind: 'app'; app: OpenableApp };

export type AdviceOpenerSettings = { kind: 'settings'; pane: SettingsPane };

/** Where the person handles an advice: the app that owns its data, or a pane of System Settings. */
export type AdviceOpener = AdviceOpenerApp | AdviceOpenerSettings;

export type CatalogRemovalDelete = { kind: 'delete' };

export type CatalogRemovalAdvice = {
  kind: 'advice';
  advice: string;
  /** Subpaths of the advised folder that other entries offer, so the advice holds none of them. */
  carvedPaths: string[];
  /** Where the person handles it; `null` when no app or pane does. */
  opener: AdviceOpener | null;
};

/** The probes of the container engines, one per engine, each with its own entry and advice. */
export type EngineProbeId = 'dockerDesktopEngine' | 'orbStackEngine' | 'colimaEngine';

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
  | 'pnpmStoresXdg'
  | EngineProbeId
  | 'vagrantBoxes'
  | 'icloudDownloads'
  | 'downloadsInstallers'
  | 'mailDownloads'
  | 'ollamaModels'
  | 'huggingFaceRepos'
  | 'claudeTranscripts'
  | 'claudeCodeVersions'
  | 'ideVersions'
  | 'rustupToolchains'
  | 'condaPackages'
  | 'fvmVersions';

/** Offered as the units its probe finds; the advice stands when the probe cannot run. */
export type CatalogRemovalExplore = { kind: 'explore'; probe: ExploreProbeId; advice: string };

export type CatalogRemoval = CatalogRemovalDelete | CatalogRemovalAdvice | CatalogRemovalExplore;

export type CatalogSelectionPath = { kind: 'path' };

/** Each entry directly inside the path, one item each. */
export type CatalogSelectionChildren = { kind: 'children' };

/**
 * One item per child folder that holds `markerName`, such as a browser profile's `Preferences`;
 * its targets are the `subpaths` that exist in it.
 */
export type CatalogSelectionProfileFolders = {
  kind: 'profileFolders';
  markerName: string;
  subpaths: string[];
};

/** Which paths of an entry's path become items. */
export type CatalogSelection =
  | CatalogSelectionPath
  | CatalogSelectionChildren
  | CatalogSelectionProfileFolders;

export type CatalogAgeRuleNone = { kind: 'none' };

/**
 * Offered only once nothing inside changed for `days` under the default stale window; a scan with
 * another stale window scales `days` by it, so every entry moves with the scan's option alike.
 */
export type CatalogAgeRuleUnchangedDays = { kind: 'unchangedDays'; days: number };

export type CatalogAgeRule = CatalogAgeRuleNone | CatalogAgeRuleUnchangedDays;

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
  selection: CatalogSelection;
  ageRule: CatalogAgeRule;
  /** The app that owns the data, `null` for none; while it runs, the entry is withheld. */
  owner: CatalogOwner | null;
  removal: CatalogRemoval;
};
