/** The folder names of a place below the home folder, joined by the platform's separator. */
export type HomeRelativePathNames = string[];

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
  /** The evidence line of a project search that did not search everything, such as cloud-only folders. */
  projectSearchIncompleteEvidence: string;
};
