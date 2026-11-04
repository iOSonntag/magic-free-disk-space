import type { CatalogLocation, EngineProbeId } from '../catalog/catalog.js';

/** The folder names of a place below the home folder, joined by the platform's separator. */
export type HomeRelativePathNames = string[];

/** An engine at fixed places, with one socket and one disk image. */
export type ContainerEngineFixed = {
  kind: 'fixed';
  engineName: string;
  /** In order; the probe takes the first that exists and tries no other. */
  socketPaths: [HomeRelativePathNames, ...HomeRelativePathNames[]];
  /** The one home of the engine's disk image: the engine units' path, and the path of the engine's advice entry. */
  diskImagePath: HomeRelativePathNames;
};

/**
 * An engine that runs one instance per profile, each with its own folder below `profilesRoot`,
 * its socket in that folder, and its own disk image. A name starting with `_` is the engine's own
 * folder, not a profile's.
 */
export type ContainerEngineProfiles = {
  kind: 'profiles';
  engineName: string;
  profilesRoot: HomeRelativePathNames;
  /** The name of the socket in a profile's folder. */
  socketName: string;
  /** The profile probed alone when `profilesRoot` cannot be listed. */
  defaultProfileName: string;
  /** The disk image of the profile of a folder name. */
  buildDiskImagePath: (profileName: string) => HomeRelativePathNames;
  /** The default profile's disk image, the path of the engine's advice entry. */
  diskImagePath: HomeRelativePathNames;
};

/** A container engine the probe of its id asks over its own sockets. */
export type ContainerEngine = ContainerEngineFixed | ContainerEngineProfiles;

/** The roots of the IDE versions, by their kind; a version's plugins lie inside its settings. */
export type IdeVersionRoots = Record<'caches' | 'logs' | 'settings', HomeRelativePathNames[]>;

/** What the explore probes take from the operating system: where the tools keep their data. */
export type ExplorePlatform = {
  /** pnpm's homes, the platform's own first, then the XDG data place where it has a default. */
  pnpmHomes: CatalogLocation[];
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
  icloudDriveRoot: HomeRelativePathNames | null;
  /** Mail's folder of saved attachments; `null` where the platform has none, so its probe cannot run. */
  mailDownloadsRoot: HomeRelativePathNames | null;
  /** The bundles of Mail, whose running process may still open the attachments it saved. */
  mailBundlePaths: string[];
  /**
   * The person's folder of downloads, the browsers' default target; `null` where it is no fixed
   * place below the home folder, so its probe cannot run.
   */
  downloadsRoot: HomeRelativePathNames | null;
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
