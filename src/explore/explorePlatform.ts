import type { CatalogLocation, EngineProbeId } from '../catalog/catalog.js';

/** An engine at fixed places, with one socket and one disk image. */
export type ContainerEngineFixed = {
  kind: 'fixed';
  engineName: string;
  /** In order; the probe takes the first that exists and tries no other. */
  socketPaths: [CatalogLocation, ...CatalogLocation[]];
  /** The one home of the engine's disk image: the engine units' path, and the path of the engine's advice entry. */
  diskImagePath: CatalogLocation;
};

/**
 * An engine that runs one instance per profile, each with its own folder below `profilesRoot`,
 * its socket in that folder, and its own disk image. A name starting with `_` is the engine's own
 * folder, not a profile's.
 */
export type ContainerEngineProfiles = {
  kind: 'profiles';
  engineName: string;
  profilesRoot: CatalogLocation;
  /** The name of the socket in a profile's folder. */
  socketName: string;
  /** The profile probed alone when `profilesRoot` cannot be listed. */
  defaultProfileName: string;
  /** The disk image of the profile of a folder name. */
  buildDiskImagePath: (profileName: string) => CatalogLocation;
  /** The default profile's disk image, the path of the engine's advice entry. */
  diskImagePath: CatalogLocation;
};

/** A container engine the probe of its id asks over its own sockets. */
export type ContainerEngine = ContainerEngineFixed | ContainerEngineProfiles;

/** The roots of the IDE versions, by their kind; a version's plugins lie inside its settings. */
export type IdeVersionRoots = Record<'caches' | 'logs' | 'settings', CatalogLocation[]>;

/** A folder of a node version manager with one folder per node version. */
export type NodeVersionsRoot = {
  location: CatalogLocation;
  /** The names from a version's folder to its npm prefix, such as fnm's `installation`. */
  prefixNames: string[];
};

/**
 * The places of the platform where pnpm may be installed, each missing where its tool is not.
 * Homebrew's prefixes are the probe's own.
 */
export type PnpmInstallPlaces = {
  /**
   * pnpm's homes, the platform's own first, then the XDG data place where it has a default; each
   * holds pnpm's `.tools` and `global` folders.
   */
  homes: CatalogLocation[];
  /** corepack's folders of pnpm, each with one folder per version. */
  corepackRoots: CatalogLocation[];
  /** The folders of pnpm a tool manager installs itself, such as asdf's, one folder per version. */
  pnpmVersionsRoots: CatalogLocation[];
  /** mise's installs folders, whose folders naming pnpm hold one folder per version. */
  miseInstallsRoots: CatalogLocation[];
  /**
   * The files that start pnpm in its homes: pnpm's executable, an install of no known version, or
   * a script starting with `#!` that runs a pnpm of a place read on its own.
   */
  launchers: CatalogLocation[];
  /** npm's prefixes at fixed places; Homebrew's prefixes and each node version's are prefixes too. */
  npmPrefixes: CatalogLocation[];
  /** The folder of npm's global packages below a prefix, by its names. */
  npmGlobalFolderNames: string[];
  /** The node version managers' folders of versions, whose npm globals may hold pnpm. */
  nodeVersionsRoots: NodeVersionsRoot[];
};

/** What the explore probes take from the operating system: where the tools keep their data. */
export type ExplorePlatform = {
  pnpmInstallPlaces: PnpmInstallPlaces;
  /** pnpm's store at the platform's own place. */
  pnpmStoreRoot: CatalogLocation;
  /** pnpm's store at the XDG data place; `null` where pnpm has no default for it, as on Windows. */
  pnpmXdgStoreRoot: CatalogLocation | null;
  /** The Android SDK at the place Android Studio installs it. */
  androidSdkRoot: CatalogLocation;
  /**
   * Flutter's settings files, in order; the first that exists is Flutter's, whose `android-sdk`
   * may name a second SDK.
   */
  flutterSettingsPaths: CatalogLocation[];
  /** VS Code's folder of profiles, each with its own list of extensions. */
  vscodeProfilesRoot: CatalogLocation;
  /** The evidence line of a project search that did not search everything, such as cloud-only folders. */
  projectSearchIncompleteEvidence: string;
  /**
   * The container engines by their probes; `null` where the platform has no such engine the probe
   * can reach, so its probe cannot run.
   */
  containerEngines: Record<EngineProbeId, ContainerEngine | null>;
  /** The folders of the JetBrains IDEs and Android Studio that hold one folder per version. */
  ideVersionRoots: IdeVersionRoots;
  /** iCloud Drive's local folder; `null` where the platform has none, so its probe cannot run. */
  icloudDriveRoot: CatalogLocation | null;
  /** Mail's folder of saved attachments; `null` where the platform has none, so its probe cannot run. */
  mailDownloadsRoot: CatalogLocation | null;
  /** The bundles of Mail, whose running process may still open the attachments it saved. */
  mailBundlePaths: string[];
  /**
   * The person's folder of downloads, the browsers' default target; `null` where the platform
   * explores none, so its probe cannot run.
   */
  downloadsRoot: CatalogLocation | null;
  /** The browsers that write a partial download, which must not run while one of theirs goes. */
  browserBundles: BrowserBundles;
};

/** The browser families in the order of their findings. */
export const BROWSER_FAMILIES = ['chromium', 'firefox', 'safari'] as const;

/** The browsers of one engine, which name their partial downloads alike. */
export type BrowserFamily = (typeof BROWSER_FAMILIES)[number];

/** The browsers of a family by the bundle names in the app folders, and those the system keeps. */
export type BrowserFamilyBundles = { appBundleNames: string[]; systemBundlePaths: string[] };

export type BrowserBundles = Record<BrowserFamily, BrowserFamilyBundles>;
