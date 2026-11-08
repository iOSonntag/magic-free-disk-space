import { resolveCatalogLocation } from '../../catalog/resolveCatalogLocation.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { toNonEmpty } from '../../system/nonEmptyList.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type {
  ExploreFileUnreadable,
  ExploreFinding,
  ExploreFoundEvictFile,
  ExploreFoundEvictFiles,
} from '../exploreUnit.js';
import { formatCountText, formatIsoDay } from '../formatLimitTexts.js';
import { loadExploreDirectoryEntries } from '../loadExploreRead.js';
import { loadWalkedFiles } from '../loadWalkedFiles.js';
import { isEvictableFile } from './decideEvictFile.js';

/** The folder of iCloud Drive's own files; the other folders each hold one app's documents. */
const CLOUD_DOCS_FOLDER_NAME = 'com~apple~CloudDocs';

/** The most files one walk judges; past it, the probe says it judged only some. */
const ICLOUD_MAX_FILES = 20_000;

/** Folders read at once, as the other walks of the scan read them. */
const ICLOUD_MAX_CONCURRENT_DIRECTORIES = 8;

/** A folder of the walk: the top-level place the person sees, and the folder it reads. */
type IcloudPlace = { folderPath: AbsolutePath; displayName: string; isWalked: boolean };

type IcloudPlaceFiles = { files: ExploreFoundEvictFile[]; isComplete: boolean };

/**
 * Walks the platform's iCloud Drive folder for downloaded files untouched since the cutoff, one
 * evict unit per folder as Finder shows iCloud Drive: each folder in iCloud Drive's own files, its
 * loose files together, and each app's folder. A folder whose content only the cloud holds is
 * never read, so the walk downloads nothing; hidden entries are left alone. `placeMissing` where
 * the platform has no iCloud Drive or it is not set up.
 */
export async function loadIcloudDownloadFindings(
  run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  if (run.platform.explore.icloudDriveRoot === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const rootPath = resolveCatalogLocation({
    environment: run.environment,
    location: run.platform.explore.icloudDriveRoot,
  });
  const places = await loadIcloudPlaces({ run: run, rootPath: rootPath });

  if (places.kind === 'failed') {
    return places;
  }

  if (places.value === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const findings: ExploreFinding[] = [];
  let isComplete = true;
  let fileBudget = ICLOUD_MAX_FILES;

  for (const place of places.value) {
    const placeFiles = await loadPlaceFiles({ run: run, place: place, maxFiles: fileBudget });

    fileBudget -= placeFiles.files.length;
    isComplete = isComplete && placeFiles.isComplete;

    const foundFiles = toNonEmpty(placeFiles.files);

    if (foundFiles === null) {
      continue;
    }

    findings.push(buildIcloudFinding({ run: run, place: place, foundFiles: foundFiles }));
  }

  return { kind: 'succeeded', value: { findings: findings, isComplete: isComplete } };
}

/**
 * The places of iCloud Drive's folder: in iCloud Drive's own files each folder, and the folder
 * itself for its loose files; every other folder whole. `null` when the folder is not there.
 */
async function loadIcloudPlaces(params: {
  run: ExploreProbeToolRun;
  rootPath: AbsolutePath;
}): Promise<Result<IcloudPlace[] | null, ExploreFileUnreadable>> {
  const rootEntries = await loadExploreDirectoryEntries({
    path: params.rootPath,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });

  if (rootEntries.kind === 'failed') {
    return rootEntries;
  }

  if (rootEntries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const places: IcloudPlace[] = [];

  for (const entry of rootEntries.value) {
    if (entry.kind !== 'directory' || entry.name.startsWith('.')) {
      continue;
    }

    const folderPath = joinPath({ run: params.run, parentPath: params.rootPath, name: entry.name });

    if (entry.name !== CLOUD_DOCS_FOLDER_NAME) {
      places.push({
        folderPath: folderPath,
        displayName: formatAppFolderName({ name: entry.name }),
        isWalked: true,
      });

      continue;
    }

    const cloudDocsPlaces = await loadCloudDocsPlaces({ run: params.run, folderPath: folderPath });

    if (cloudDocsPlaces.kind === 'failed') {
      return cloudDocsPlaces;
    }

    places.push(...cloudDocsPlaces.value);
  }

  return { kind: 'succeeded', value: places };
}

/** No place in a folder kept in the cloud only, whose listing would download it, or in a link. */
async function loadCloudDocsPlaces(params: {
  run: ExploreProbeToolRun;
  folderPath: AbsolutePath;
}): Promise<Result<IcloudPlace[], ExploreFileUnreadable>> {
  const placement = params.run.platform.entryReads.loadEntryPlacement({
    path: params.folderPath,
    kind: 'directory',
  });

  switch (placement) {
    case 'cloudOnly':
    case 'link':
      return { kind: 'succeeded', value: [] };
    case 'onDisk':
      return loadListedCloudDocsPlaces(params);
  }
}

async function loadListedCloudDocsPlaces(params: {
  run: ExploreProbeToolRun;
  folderPath: AbsolutePath;
}): Promise<Result<IcloudPlace[], ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const folderPlaces = (entries.value ?? [])
    .filter((entry) => entry.kind === 'directory' && !entry.name.startsWith('.'))
    .map((entry) => ({
      folderPath: joinPath({ run: params.run, parentPath: params.folderPath, name: entry.name }),
      displayName: entry.name,
      isWalked: true,
    }));

  return {
    kind: 'succeeded',
    value: [
      ...folderPlaces,
      { folderPath: params.folderPath, displayName: 'iCloud Drive', isWalked: false },
    ],
  };
}

/**
 * The downloaded, untouched files of the place, at most `maxFiles`: below it at any depth, or
 * only its own files for a place that is not walked.
 */
async function loadPlaceFiles(params: {
  run: ExploreProbeToolRun;
  place: IcloudPlace;
  maxFiles: number;
}): Promise<IcloudPlaceFiles> {
  const walked = await loadWalkedFiles({
    run: params.run,
    rootPath: params.place.folderPath,
    isDescending: params.place.isWalked,
    maxFiles: params.maxFiles,
    maxConcurrentDirectories: ICLOUD_MAX_CONCURRENT_DIRECTORIES,
    isKept: (stats) => isEvictableFile({ stats: stats, cutoffMs: params.run.unusedCutoffMs }),
  });

  return {
    files: walked.files.map((file) => ({
      path: file.path,
      modifiedMs: file.stats.modifiedMs,
      accessedMs: file.stats.accessedMs,
    })),
    isComplete: walked.isComplete,
  };
}

function buildIcloudFinding(params: {
  run: ExploreProbeToolRun;
  place: IcloudPlace;
  foundFiles: ExploreFoundEvictFiles;
}): ExploreFinding {
  const lastTouchedMs = Math.max(
    ...params.foundFiles.map((file) => Math.max(file.modifiedMs, file.accessedMs)),
  );

  return {
    unit: {
      kind: 'icloudFolder',
      tool: params.run.tool,
      folderPath: params.place.folderPath,
      cutoffMs: params.run.unusedCutoffMs,
      foundFiles: params.foundFiles,
    },
    title: `Downloaded iCloud Drive files in ${params.place.displayName}`,
    explanation:
      'Files of iCloud Drive that are downloaded to this Mac and that nobody opened or changed for the unused period. Removing the download frees the space here; iCloud Drive keeps every file, and it shows in Finder as before.',
    regeneration: 'Downloaded again from iCloud Drive when a file is opened.',
    risk: 'review',
    evidenceLines: [
      `${formatCountText({ count: params.foundFiles.length, noun: 'file' })} downloaded and untouched, the newest last touched on ${formatIsoDay(lastTouchedMs)}.`,
    ],
    displayPath: params.place.folderPath,
    activity: decideUnitActivity({
      facts: { kind: 'untouchedFiles' },
      runningProcesses: params.run.runningProcesses,
    }),
  };
}

function joinPath(params: {
  run: ExploreProbeToolRun;
  parentPath: AbsolutePath;
  name: string;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.run.environment.pathRules,
    parentPath: params.parentPath,
    names: [params.name],
  });
}

/** An app's folder by the last part of its name: `iCloud~md~obsidian` is Obsidian's. */
function formatAppFolderName(params: { name: string }): string {
  const parts = params.name.split('~');

  return parts[parts.length - 1] ?? params.name;
}
