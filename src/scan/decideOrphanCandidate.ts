import { basename, dirname } from 'node:path';
import type { MacBundleId } from '../catalog/catalogOwner.js';
import { buildInstalledBundleIds } from './buildInstalledBundleIds.js';
import type { CandidateDecision, SkipReason } from './candidate.js';
import type { LeftoverMatch } from './candidateOrigin.js';
import type { Measurement } from './loadPathMeasurement.js';
import { isAppleBundleId, parseBundleIdShapedName } from './resolveOwnerState.js';
import type {
  InstalledApp,
  OrphanLocation,
  OrphanLocationNamingBundleIdOrName,
} from './scanPlatform.js';

/** The prefix of an app group's id, which names the group, not an app. */
const APP_GROUP_PREFIX = 'group.';

/** A word of a name shorter than this, such as `app` or `pro`, ties a folder to no app. */
const MIN_NAME_WORD_LENGTH = 4;

/** The skips of a name that ties its folder to no app at all, so it was never a possible leftover. */
const UNTIED_NAME_SKIP_REASONS: SkipReason[] = ['notBundleId', 'genericName'];

/** What the installed apps tell about a folder named like an app or a bundle id. */
export type OrphanInstalledFacts = {
  bundleIds: Set<MacBundleId>;
  /** The first two parts of every installed bundle id, lower-case, such as `com.google`. */
  vendorIds: Set<string>;
  /** The installed apps' names and their vendor folders' names, lower-case. */
  names: Set<string>;
  /** The words of those names, lower-case, of at least `MIN_NAME_WORD_LENGTH` letters. */
  nameWords: Set<string>;
  /** False when an app folder or a bundle id could not be read. */
  isComplete: boolean;
};

/** A folder that may be the data of a removed app, and how its name tied it to one. */
export type OrphanNameMatchMatch = { kind: 'match'; matchedBy: LeftoverMatch };

/** A folder its name holds back before any read, and why. */
export type OrphanNameMatchSkip = { kind: 'skip'; reason: SkipReason };

export type OrphanNameMatch = OrphanNameMatchMatch | OrphanNameMatchSkip;

/**
 * The facts of the installed apps: their ids, their vendors, and their names with the names of
 * the vendor folders they lie in inside an app folder.
 */
export function buildOrphanInstalledFacts(params: {
  apps: InstalledApp[];
  applicationDirs: string[];
  isComplete: boolean;
}): OrphanInstalledFacts {
  const bundleIds = buildInstalledBundleIds({ apps: params.apps });
  const names = new Set<string>();

  for (const app of params.apps) {
    names.add(app.displayName.toLowerCase());

    const bundleFolder = dirname(app.bundlePath);

    if (!params.applicationDirs.includes(bundleFolder)) {
      names.add(basename(bundleFolder).toLowerCase());
    }
  }

  return {
    bundleIds: bundleIds,
    vendorIds: new Set([...bundleIds].map((bundleId) => getVendorId({ bundleId: bundleId }))),
    names: names,
    nameWords: new Set([...names].flatMap((name) => listNameWords({ name: name }))),
    isComplete: params.isComplete,
  };
}

/**
 * Returns why a container name is no orphan, or `null` when it may be one. It needs no
 * measurement, so the scanner skips these names without reading their folders. While an
 * installed app could not be read, no container counts as orphaned: it may be that app's.
 */
export function getOrphanNameSkipReason(params: {
  name: string;
  installedBundleIds: Set<MacBundleId>;
  isInstalledAppListComplete: boolean;
}): SkipReason | null {
  const bundleId = parseBundleIdShapedName({ name: params.name });

  if (bundleId === null) {
    return 'notBundleId';
  }

  if (isAppleBundleId({ bundleId: bundleId })) {
    return 'systemOwned';
  }

  if (params.installedBundleIds.has(bundleId)) {
    return 'ownerInstalled';
  }

  if (!params.isInstalledAppListComplete) {
    return 'installedAppsUnknown';
  }

  return null;
}

/**
 * Whether the folder `name` of the location may be the data of a removed app, and how it was tied
 * to one. It needs no measurement, so the scanner skips the others without reading their folders.
 * A name that is no bundle id matches only where the location's naming allows it, and never a
 * name the system keeps, a generic word, or any word of an installed app's name or vendor folder:
 * such a folder may hold what an installed app still uses.
 */
export function matchOrphanName(params: {
  name: string;
  location: OrphanLocation;
  installed: OrphanInstalledFacts;
}): OrphanNameMatch {
  if (!params.name.endsWith(params.location.nameSuffix) || params.name.startsWith('.')) {
    return { kind: 'skip', reason: 'notBundleId' };
  }

  const idName = params.name.slice(0, params.name.length - params.location.nameSuffix.length);
  const bundleId = parseBundleIdShapedName({ name: idName });

  if (bundleId !== null) {
    return matchOrphanBundleId({
      bundleId: bundleId,
      location: params.location,
      installed: params.installed,
    });
  }

  if (params.location.naming.kind === 'bundleId' || params.location.nameSuffix !== '') {
    return { kind: 'skip', reason: 'notBundleId' };
  }

  return matchOrphanAppName({
    name: idName,
    naming: params.location.naming,
    installed: params.installed,
  });
}

/**
 * Whether the scan tells a folder that `matchOrphanName` held back: never one whose name ties it
 * to no app, and any other only in a location no other entry judges, so each folder is told once.
 */
export function isOrphanNameSkipReported(params: {
  reason: SkipReason;
  location: OrphanLocation;
}): boolean {
  return params.location.isOnlyJudge && !UNTIED_NAME_SKIP_REASONS.includes(params.reason);
}

function matchOrphanBundleId(params: {
  bundleId: MacBundleId;
  location: OrphanLocation;
  installed: OrphanInstalledFacts;
}): OrphanNameMatch {
  const nameSkipReason = getOrphanNameSkipReason({
    name: params.bundleId,
    installedBundleIds: params.installed.bundleIds,
    isInstalledAppListComplete: params.installed.isComplete,
  });

  if (nameSkipReason !== null) {
    return { kind: 'skip', reason: nameSkipReason };
  }

  const appId = params.bundleId.startsWith(APP_GROUP_PREFIX)
    ? params.bundleId.slice(APP_GROUP_PREFIX.length)
    : params.bundleId;

  if (
    params.location.isVendorShared &&
    params.installed.vendorIds.has(getVendorId({ bundleId: appId }))
  ) {
    return { kind: 'skip', reason: 'ownerInstalled' };
  }

  return { kind: 'match', matchedBy: 'bundleId' };
}

function matchOrphanAppName(params: {
  name: string;
  naming: OrphanLocationNamingBundleIdOrName;
  installed: OrphanInstalledFacts;
}): OrphanNameMatch {
  const lowerCaseName = params.name.toLowerCase();

  if (
    params.naming.systemFolderNames.has(lowerCaseName) ||
    params.naming.systemServiceNamePattern.test(params.name)
  ) {
    return { kind: 'skip', reason: 'systemOwned' };
  }

  const words = listNameWords({ name: params.name });

  if (params.naming.genericFolderNames.has(lowerCaseName) || words.length === 0) {
    return { kind: 'skip', reason: 'genericName' };
  }

  if (!params.installed.isComplete) {
    return { kind: 'skip', reason: 'installedAppsUnknown' };
  }

  if (
    params.installed.names.has(lowerCaseName) ||
    words.some((word) => params.installed.nameWords.has(word))
  ) {
    return { kind: 'skip', reason: 'ownerInstalled' };
  }

  return { kind: 'match', matchedBy: 'name' };
}

/**
 * Offers the folder `name` of an app that no installed bundle carries and that nothing in the
 * folder changed since `unusedCutoffMs`, else skips it. A recent change means the app still runs
 * from somewhere outside the Applications folders.
 */
export function decideOrphanCandidate(params: {
  path: string;
  name: string;
  matchedBy: LeftoverMatch;
  location: OrphanLocation;
  measurement: Measurement;
  unusedCutoffMs: number;
  minOfferedBytes: number;
}): CandidateDecision {
  if (params.measurement.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: params.path, reason: 'symbolicLink' };
  }

  if (params.measurement.allocatedBytes < params.minOfferedBytes) {
    return { kind: 'skip', path: params.path, reason: 'belowSizeThreshold' };
  }

  // A partial walk may have missed the newest change.
  if (!params.measurement.isComplete) {
    return { kind: 'skip', path: params.path, reason: 'activityUnknown' };
  }

  if (params.measurement.latestModifiedMs >= params.unusedCutoffMs) {
    return { kind: 'skip', path: params.path, reason: 'recentActivity' };
  }

  return {
    kind: 'offer',
    candidate: {
      path: params.path,
      title: `Data of an app that is no longer installed (${params.name})`,
      category: 'leftovers',
      // Careful, not review: such a folder holds the documents of its app, such as virtual machines.
      risk: 'careful',
      origin: { kind: 'leftover', matchedBy: params.matchedBy },
      explanation:
        params.matchedBy === 'name'
          ? `${params.location.explanation} It was tied to its app by its name alone, which may be wrong.`
          : params.location.explanation,
      regeneration:
        'Not regenerated. If the app was moved elsewhere or is installed again, it starts without this data.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
      // The newest change inside, the one sign of use a folder of a removed app gives.
      lastUsedAtMs: params.measurement.latestModifiedMs,
      downloadedAtMs: null,
      appName: null,
      removal: {
        kind: 'deletePaths',
        targets: [{ path: params.path, identity: params.measurement.identity }],
        owner: { kind: 'none' },
      },
    },
  };
}

function getVendorId(params: { bundleId: string }): string {
  return params.bundleId.toLowerCase().split('.').slice(0, 2).join('.');
}

/** The words of a name, split at spaces, marks, and a change to a capital, lower-case. */
function listNameWords(params: { name: string }): string[] {
  return params.name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= MIN_NAME_WORD_LENGTH);
}
