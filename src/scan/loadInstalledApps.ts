import { basename, join } from 'node:path';
import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadCommandOutput } from '../system/loadCommandOutput.js';
import type { DirectoryFailure } from '../system/loadDirectoryNames.js';
import { loadDirectoryNames } from '../system/loadDirectoryNames.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import type { ScanIssue } from './issue.js';

export type InstalledApp = {
  bundlePath: string;
  displayName: string;
  bundleId: string | null;
  /** Bundle ids of helpers and extensions inside the app; they belong to the app. */
  nestedBundleIds: string[];
};

type AppBundleSearch = {
  bundlePaths: string[];
  issues: ScanIssue[];
};

const APP_BUNDLE_SUFFIX = '.app';

const NESTED_BUNDLE_SUFFIXES = [APP_BUNDLE_SUFFIX, '.appex', '.xpc'];

/** An iOS app on a Mac with Apple silicon: a link to the real bundle, which has no Contents. */
const WRAPPED_BUNDLE_NAME = 'WrappedBundle';

const MAC_INFO_PLIST_RELATIVE_PATH = 'Contents/Info.plist';

/** Where a bundle keeps its Info.plist when not in the macOS layout: wrapped iOS app, iOS layout. */
const FALLBACK_INFO_PLIST_RELATIVE_PATHS = [`${WRAPPED_BUNDLE_NAME}/Info.plist`, 'Info.plist'];

/**
 * Depth 1 is the direct entries of Contents. Six reaches an XPC service inside a framework,
 * `Frameworks/X.framework/Versions/A/XPCServices/Y.xpc`, whose container must not look orphaned.
 */
const NESTED_BUNDLE_MAX_DEPTH = 6;

/**
 * Lists the apps in the app folders and in the vendor folders one level down. Failures are
 * returned as issues, never thrown. A symbolic link named like an app is listed too.
 */
export async function loadInstalledApps(params: {
  appDirs: string[];
  commandTimeoutMs: number;
}): Promise<{ apps: InstalledApp[]; issues: ScanIssue[] }> {
  const appBundleSearch = await findAppBundlePaths({ appDirs: params.appDirs });
  const apps: InstalledApp[] = [];
  const issues: ScanIssue[] = [...appBundleSearch.issues];

  for (const bundlePath of appBundleSearch.bundlePaths) {
    const bundleIdResult = await loadBundleId({
      bundlePath: bundlePath,
      commandTimeoutMs: params.commandTimeoutMs,
    });
    const nested = await loadNestedBundleIds({
      bundlePath: bundlePath,
      commandTimeoutMs: params.commandTimeoutMs,
    });

    if (bundleIdResult.kind === 'failed') {
      issues.push({
        path: bundlePath,
        reason: 'commandFailed',
        detail: bundleIdResult.failure.reason,
      });
    }

    issues.push(...nested.issues);

    apps.push({
      bundlePath: bundlePath,
      displayName: basename(bundlePath).slice(0, -APP_BUNDLE_SUFFIX.length),
      bundleId: bundleIdResult.kind === 'succeeded' ? bundleIdResult.value : null,
      nestedBundleIds: nested.bundleIds,
    });
  }

  return { apps: apps, issues: issues };
}

async function findAppBundlePaths(params: { appDirs: string[] }): Promise<AppBundleSearch> {
  const bundlePaths: string[] = [];
  const issues: ScanIssue[] = [];

  for (const appDir of params.appDirs) {
    const listing = await loadDirectoryNames({ path: appDir });

    if (listing.kind === 'failed') {
      const listingIssue = getReadIssue({ path: appDir, failure: listing.failure });

      if (listingIssue !== null) {
        issues.push(listingIssue);
      }

      continue;
    }

    for (const name of listing.value) {
      const entryPath = join(appDir, name);

      if (isAppBundleName({ name: name })) {
        bundlePaths.push(entryPath);
        continue;
      }

      const stats = await loadEntryStats({ path: entryPath });

      if (stats.kind === 'failed') {
        const statsIssue = getReadIssue({ path: entryPath, failure: stats.failure });

        if (statsIssue !== null) {
          issues.push(statsIssue);
        }

        continue;
      }

      if (stats.value.kind === 'directory') {
        const vendorSearch = await findVendorBundlePaths({ vendorPath: entryPath });

        bundlePaths.push(...vendorSearch.bundlePaths);
        issues.push(...vendorSearch.issues);
      }
    }
  }

  return { bundlePaths: bundlePaths, issues: issues };
}

async function findVendorBundlePaths(params: { vendorPath: string }): Promise<AppBundleSearch> {
  const listing = await loadDirectoryNames({ path: params.vendorPath });

  if (listing.kind === 'failed') {
    const listingIssue = getReadIssue({ path: params.vendorPath, failure: listing.failure });

    return { bundlePaths: [], issues: listingIssue === null ? [] : [listingIssue] };
  }

  const bundlePaths = listing.value
    .filter((name) => isAppBundleName({ name: name }))
    .map((name) => join(params.vendorPath, name));

  return { bundlePaths: bundlePaths, issues: [] };
}

function getReadIssue(params: {
  path: string;
  failure: DirectoryFailure | FileFailure;
}): ScanIssue | null {
  if (params.failure.reason === 'permissionDenied' || params.failure.reason === 'unexpected') {
    return { path: params.path, reason: params.failure.reason, detail: params.failure.code };
  }

  return null;
}

function isAppBundleName(params: { name: string }): boolean {
  return params.name.toLowerCase().endsWith(APP_BUNDLE_SUFFIX);
}

/** Reads the id from the first Info.plist that holds one; the failure is the macOS layout's. */
async function loadBundleId(params: {
  bundlePath: string;
  commandTimeoutMs: number;
}): Promise<Result<string, CommandFailure>> {
  const macBundleId = await loadInfoPlistBundleId({
    infoPlistPath: join(params.bundlePath, MAC_INFO_PLIST_RELATIVE_PATH),
    commandTimeoutMs: params.commandTimeoutMs,
  });

  if (macBundleId.kind === 'succeeded') {
    return macBundleId;
  }

  for (const relativePath of FALLBACK_INFO_PLIST_RELATIVE_PATHS) {
    const bundleId = await loadInfoPlistBundleId({
      infoPlistPath: join(params.bundlePath, relativePath),
      commandTimeoutMs: params.commandTimeoutMs,
    });

    if (bundleId.kind === 'succeeded') {
      return bundleId;
    }
  }

  return macBundleId;
}

async function loadInfoPlistBundleId(params: {
  infoPlistPath: string;
  commandTimeoutMs: number;
}): Promise<Result<string, CommandFailure>> {
  const plutilResult = await loadCommandOutput({
    command: 'plutil',
    args: ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', params.infoPlistPath],
    timeoutMs: params.commandTimeoutMs,
  });

  if (plutilResult.kind === 'failed') {
    return plutilResult;
  }

  return { kind: 'succeeded', value: plutilResult.value.trim() };
}

/**
 * A nested bundle without an id adds nothing. One whose id could not be read, because `plutil`
 * timed out or did not start, adds an issue: its container would otherwise look orphaned.
 */
async function loadNestedBundleIds(params: {
  bundlePath: string;
  commandTimeoutMs: number;
}): Promise<{ bundleIds: string[]; issues: ScanIssue[] }> {
  const nestedBundlePathLists = await Promise.all(
    [join(params.bundlePath, 'Contents'), join(params.bundlePath, WRAPPED_BUNDLE_NAME)].map(
      (searchRootPath) =>
        findNestedBundlePaths({ directoryPath: searchRootPath, directoryDepth: 0 }),
    ),
  );
  const nestedBundlePaths = nestedBundlePathLists.flat();
  const bundleIds: string[] = [];
  const issues: ScanIssue[] = [];

  for (const nestedBundlePath of nestedBundlePaths) {
    const bundleIdResult = await loadBundleId({
      bundlePath: nestedBundlePath,
      commandTimeoutMs: params.commandTimeoutMs,
    });

    if (bundleIdResult.kind === 'succeeded') {
      bundleIds.push(bundleIdResult.value);
    } else if (bundleIdResult.failure.reason !== 'exitedWithError') {
      issues.push({
        path: nestedBundlePath,
        reason: 'commandFailed',
        detail: bundleIdResult.failure.reason,
      });
    }
  }

  return { bundleIds: bundleIds, issues: issues };
}

async function findNestedBundlePaths(params: {
  directoryPath: string;
  directoryDepth: number;
}): Promise<string[]> {
  const listing = await loadDirectoryNames({ path: params.directoryPath });

  if (listing.kind === 'failed') {
    return [];
  }

  const bundlePaths: string[] = [];

  for (const name of listing.value) {
    const entryPath = join(params.directoryPath, name);
    const stats = await loadEntryStats({ path: entryPath });

    if (stats.kind === 'failed' || stats.value.kind !== 'directory') {
      continue;
    }

    if (isNestedBundleName({ name: name })) {
      bundlePaths.push(entryPath);
      continue;
    }

    const entryDepth = params.directoryDepth + 1;

    if (entryDepth < NESTED_BUNDLE_MAX_DEPTH) {
      const childBundlePaths = await findNestedBundlePaths({
        directoryPath: entryPath,
        directoryDepth: entryDepth,
      });

      bundlePaths.push(...childBundlePaths);
    }
  }

  return bundlePaths;
}

function isNestedBundleName(params: { name: string }): boolean {
  const lowerCaseName = params.name.toLowerCase();

  return NESTED_BUNDLE_SUFFIXES.some((suffix) => lowerCaseName.endsWith(suffix));
}
