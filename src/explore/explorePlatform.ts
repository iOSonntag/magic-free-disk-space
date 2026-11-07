import type { EngineProbeId } from '../catalog/catalog.js';

/** The folder names of a place below the home folder, joined by the platform's separator. */
export type HomeRelativePathNames = string[];

/** A container engine the probe of its id asks over its own socket. */
export type ContainerEngine = {
  engineName: string;
  /** In order; the probe takes the first that exists and tries no other. */
  socketPaths: [HomeRelativePathNames, ...HomeRelativePathNames[]];
  /** The one home of the engine's disk image: the engine units' path, and the path of the engine's advice entry. */
  diskImagePath: HomeRelativePathNames;
};

/** The roots of the IDE versions, by their kind; a version's plugins lie inside its settings. */
export type IdeVersionRoots = Record<'caches' | 'logs' | 'settings', HomeRelativePathNames[]>;

/** What the explore probes take from the operating system: where the tools keep their data. */
export type ExplorePlatform = {
  /** pnpm's homes below the home folder, the platform's own first, then the XDG data place. */
  pnpmHomes: HomeRelativePathNames[];
  /** pnpm's store below the home folder at the platform's own place. */
  pnpmStoreRoot: HomeRelativePathNames;
  /** pnpm's store below the home folder at the XDG data place. */
  pnpmXdgStoreRoot: HomeRelativePathNames;
  /** The Android SDK below the home folder. */
  androidSdkRoot: HomeRelativePathNames;
  /**
   * Flutter's settings files below the home folder, in order; the first that exists is Flutter's,
   * whose `android-sdk` may name a second SDK.
   */
  flutterSettingsPaths: HomeRelativePathNames[];
  /** The evidence line of a project search that did not search everything, such as cloud-only folders. */
  projectSearchIncompleteEvidence: string;
  containerEngines: Record<EngineProbeId, ContainerEngine>;
  /** The folders of the JetBrains IDEs and Android Studio that hold one folder per version. */
  ideVersionRoots: IdeVersionRoots;
  /** iCloud Drive's local folder; `null` where the platform has none, so its probe cannot run. */
  icloudDriveRoot: HomeRelativePathNames | null;
  /** Mail's folder of saved attachments; `null` where the platform has none, so its probe cannot run. */
  mailDownloadsRoot: HomeRelativePathNames | null;
  /** The bundles of Mail, whose running process may still open the attachments it saved. */
  mailBundlePaths: string[];
  /** The person's folder of downloads, the browsers' default target. */
  downloadsRoot: HomeRelativePathNames;
  /** The browsers that write a partial download, which must not run while one goes. */
  browserBundles: BrowserBundles;
};

/** The browsers by the bundle names in the app folders, and the bundles the system keeps itself. */
export type BrowserBundles = { appBundleNames: string[]; systemBundlePaths: string[] };
