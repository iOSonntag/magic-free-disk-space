import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import type { ScanIssue } from './issue.js';
import type { InstalledApp } from './loadInstalledApps.js';

/** The platform's apps are listed, and an app unused for long is offered with its leftovers. */
export type ScanPlatformAppsOffered = {
  appSection: 'offerUnusedApps';
  /** Failures are returned as issues. Never throws. */
  loadInstalledApps: (params: {
    appDirs: string[];
    commandTimeoutMs: number;
  }) => Promise<{ apps: InstalledApp[]; issues: ScanIssue[] }>;
};

/** How the scan treats the platform's apps. */
export type ScanPlatformApps = ScanPlatformAppsOffered;

/** What the scan takes from the operating system. */
export type ScanPlatform = {
  apps: ScanPlatformApps;
  /** The command line of each running process, which tells what is in use. Never throws. */
  loadRunningProcesses: (params: {
    commandTimeoutMs: number;
  }) => Promise<Result<string[], CommandFailure>>;
  /** The real path of the active Xcode bundle, `null` for none. Never throws. */
  loadActiveXcodeBundlePath: (params: {
    commandTimeoutMs: number;
  }) => Promise<Result<string | null, CommandFailure>>;
  /** Top-level home folders that the project search never enters. */
  projectSearchExcludedNames: string[];
  /** Home folders searched for large files that the user may no longer need. */
  userFileRootRelativePaths: string[];
};
