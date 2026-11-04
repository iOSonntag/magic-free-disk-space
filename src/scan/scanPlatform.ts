import type { CatalogLocation, Risk } from '../catalog/catalog.js';
import type { MacBundleId } from '../catalog/catalogOwner.js';
import type { ProjectArtifactRule } from '../catalog/projectArtifactRules.js';
import type { WindowsKnownFolder } from '../environment/buildEnvironment.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import type { RecycleBinContent } from './candidate.js';
import type { ScanIssue } from './issue.js';

/** An app that installs the operating system, such as `Install macOS Sequoia.app`. */
export type SystemInstaller = {
  /** The version of the system it installs, as its build names it; `null` when none was read. */
  builtForSystemVersion: string | null;
};

export type InstalledApp = {
  bundlePath: string;
  displayName: string;
  /** `null` when no Info.plist of it could be read; an empty id stays an id. */
  bundleId: MacBundleId | null;
  /** Bundle ids of helpers and extensions inside the app; they belong to the app. */
  nestedBundleIds: MacBundleId[];
  /** `null` for every app the platform does not know as an installer of the system. */
  systemInstaller: SystemInstaller | null;
  /** The user id that owns the bundle; `null` when it could not be read. */
  ownerUid: number | null;
};

/**
 * An app of the system at the path the system keeps it, outside the app folders. It tells only
 * whether an owner runs and its name: it is never listed, offered, or the owner of a leftover.
 */
export type SystemApp = {
  bundlePath: string;
  displayName: string;
  bundleId: MacBundleId;
};

/** The folders of a location are named by an app's bundle id alone. */
export type OrphanLocationNamingBundleId = { kind: 'bundleId' };

/**
 * The folders of a location are named by an app's bundle id or by its name; a name the system
 * keeps or a word any app may use names no app.
 */
export type OrphanLocationNamingBundleIdOrName = {
  kind: 'bundleIdOrName';
  /** Names the system and its own apps keep folders under, lower-case. */
  systemFolderNames: Set<string>;
  /** The names the system's own services keep folders under, such as `rapportd`. */
  systemServiceNamePattern: RegExp;
  /** Words that name a maker or a part every app may have, lower-case. */
  genericFolderNames: Set<string>;
};

/** How an app's leftover folders are named in one location. */
export type OrphanLocationNaming =
  | OrphanLocationNamingBundleId
  | OrphanLocationNamingBundleIdOrName;

/** A folder below the home folder whose entries are each one app's data. */
export type OrphanLocation = {
  /** Below the home folder, one name per level. */
  pathNames: string[];
  naming: OrphanLocationNaming;
  /** What follows the bundle id in each name, such as `.savedState`; empty for none. */
  nameSuffix: string;
  /**
   * False only where each folder is one app's own sandbox; elsewhere a vendor's other apps may
   * share it, so an installed app of the same vendor keeps it.
   */
  isVendorShared: boolean;
  /**
   * True where no other entry judges the folders, so the scan tells each one it holds back as no
   * leftover; elsewhere, such as in `Caches`, the entries that also judge them tell it, once.
   */
  isOnlyJudge: boolean;
  /** What a leftover found here is, for the person. */
  explanation: string;
};

/** The platform's apps are listed, and an app unused for long is offered with its leftovers. */
export type ScanPlatformAppsOffered = {
  appSection: 'offerUnusedApps';
  /** Failures are returned as issues. Never throws. */
  loadInstalledApps: (params: {
    appDirs: string[];
    commandTimeoutMs: number;
  }) => Promise<{ apps: InstalledApp[]; issues: ScanIssue[] }>;
  /** The places an app keeps data in, which stay behind once the app is removed. */
  orphanLocations: OrphanLocation[];
  /** The bundle id of Xcode and of its versions, each of which is protected while it may be active. */
  xcodeBundleIdPrefix: string;
};

/** An app the system lists as installed, which the scan only advises about. */
export type AdvisedApp = {
  displayName: string;
  /** `null` when the system names no install folder for it. */
  installFolderPath: string | null;
  /** The size the system estimates for it; `null` when it gives none. */
  estimatedBytes: number | null;
};

/**
 * The platform's apps are listed with their sizes as advice, for the user to uninstall the way the
 * system does: the tool deletes nothing of them, and looks for no leftovers.
 */
export type ScanPlatformAppsAdvised = {
  appSection: 'adviseOnly';
  /** Failures are returned as issues. Never throws. */
  loadAdvisedApps: () => Promise<{ apps: AdvisedApp[]; issues: ScanIssue[] }>;
};

/** How the scan treats the platform's apps. */
export type ScanPlatformApps = ScanPlatformAppsOffered | ScanPlatformAppsAdvised;

/** The trash is a folder the catalog names with its other entries, as `~/.Trash` on macOS. */
export type ScanPlatformTrashCatalogFolder = { kind: 'catalogFolder' };

/**
 * Each root of the file system has a Recycle Bin, which the system counts and empties as one unit,
 * as each fixed drive on Windows; the texts and the risk are those of each bin's item.
 */
export type ScanPlatformTrashRecycleBins = {
  kind: 'recycleBins';
  title: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
  /** What the bin of the drive holds; a failure is the text of its error code. Never throws. */
  loadRecycleBin: RecycleBinLoad;
};

/** What the Recycle Bin of the drive at `driveRootPath` holds. Never throws. */
export type RecycleBinLoad = (params: {
  driveRootPath: AbsolutePath;
}) => Result<RecycleBinContent, string>;

/** Where the platform keeps the files its user deleted. */
export type ScanPlatformTrash = ScanPlatformTrashCatalogFolder | ScanPlatformTrashRecycleBins;

/**
 * A folder searched for large files the user may no longer need: one at a fixed place, or a known
 * folder of Windows wherever the user moved it, which the environment resolved.
 */
export type UserFileRoot =
  | { kind: 'location'; location: CatalogLocation }
  | { kind: 'knownFolder'; folder: WindowsKnownFolder };

/** What the scan takes from the operating system. */
export type ScanPlatform = {
  apps: ScanPlatformApps;
  /** The system's own apps that own catalog data, which no app folder holds. */
  systemApps: SystemApp[];
  trash: ScanPlatformTrash;
  /** The real path of the active Xcode bundle, `null` for none. Never throws. */
  loadActiveXcodeBundlePath: (params: {
    commandTimeoutMs: number;
  }) => Promise<Result<string | null, CommandFailure>>;
  /** Top-level home folders that the project search never enters. */
  projectSearchExcludedNames: string[];
  /** The build and dependency folders the project search offers. */
  projectArtifactRules: ProjectArtifactRule[];
  /** Folders searched for large files that the user may no longer need. */
  userFileRoots: UserFileRoot[];
};
