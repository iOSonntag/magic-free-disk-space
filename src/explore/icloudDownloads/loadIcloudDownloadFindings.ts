import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { walkDirectoryTree } from '../../system/walkDirectoryTree.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type {
  ExploreFileUnreadable,
  ExploreFinding,
  ExploreFoundEvictFile,
} from '../exploreUnit.js';
import { loadExploreDirectoryEntries, loadExploreEntryTimes } from '../loadExploreRead.js';
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
  const rootNames = run.platform.explore.icloudDriveRoot;

  if (rootNames === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const rootPath = joinAbsolutePath({
    rules: run.environment.pathRules,
    parentPath: run.environment.homeDir,
    names: rootNames,
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

    const [firstFile, ...restFiles] = placeFiles.files;

    if (firstFile === undefined) {
      continue;
    }

    findings.push(
      buildIcloudFinding({
        run: run,
        place: place,
        foundFiles: [firstFile, ...restFiles],
      }),
    );
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

async function loadCloudDocsPlaces(params: {
  run: ExploreProbeToolRun;
  folderPath: AbsolutePath;
}): Promise<Result<IcloudPlace[], ExploreFileUnreadable>> {
  if (isFolderEvicted({ run: params.run, path: params.folderPath })) {
    return { kind: 'succeeded', value: [] };
  }

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
  const filePaths: string[] = [];
  let isComplete = true;
  const walkEnd = await walkDirectoryTree({
    rootPath: params.place.folderPath,
    isStatsNeeded: false,
    maxConcurrentDirectories: ICLOUD_MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.run.deadlineMs,
    entryReads: params.run.platform.entryReads,
    visitEntry: (entry) => {
      if (entry.name.startsWith('.')) {
        return 'skip';
      }

      if (entry.kind === 'directory') {
        return params.place.isWalked ? 'descend' : 'skip';
      }

      if (entry.kind !== 'file') {
        return 'skip';
      }

      if (filePaths.length >= params.maxFiles) {
        return 'stop';
      }

      filePaths.push(entry.path);

      return 'skip';
    },
    onUnreadable: () => {
      isComplete = false;
    },
    onEvictedEntrySkipped: () => {},
  });
  const files: ExploreFoundEvictFile[] = [];

  for (const filePath of filePaths.sort()) {
    if (Date.now() >= params.run.deadlineMs) {
      return { files: files, isComplete: false };
    }

    const times = await loadExploreEntryTimes({
      path: filePath,
      privacyDenialCode: params.run.platform.privacyDenialCode,
    });

    if (times.kind === 'failed') {
      isComplete = false;

      continue;
    }

    if (
      times.value !== null &&
      isEvictableFile({ times: times.value, cutoffMs: params.run.unusedCutoffMs })
    ) {
      files.push({
        path: parseWalkedPath({ run: params.run, text: filePath }),
        modifiedMs: times.value.modifiedMs,
        accessedMs: times.value.accessedMs,
      });
    }
  }

  return { files: files, isComplete: isComplete && walkEnd === 'completed' };
}

function buildIcloudFinding(params: {
  run: ExploreProbeToolRun;
  place: IcloudPlace;
  foundFiles: [ExploreFoundEvictFile, ...ExploreFoundEvictFile[]];
}): ExploreFinding {
  const fileCount = params.foundFiles.length;
  const lastTouchedMs = Math.max(
    ...params.foundFiles.map((file) => Math.max(file.modifiedMs, file.accessedMs)),
  );
  const lastTouchedDate = new Date(lastTouchedMs).toISOString().slice(0, 10);

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
      `${fileCount === 1 ? '1 file' : `${fileCount} files`} downloaded and untouched, the newest last touched on ${lastTouchedDate}.`,
    ],
    displayPath: params.place.folderPath,
    activity: decideUnitActivity({
      facts: { kind: 'untouchedFiles' },
      processCommands: params.run.processCommands,
    }),
  };
}

function isFolderEvicted(params: { run: ExploreProbeToolRun; path: string }): boolean {
  return params.run.platform.entryReads.isEntryEvicted({ path: params.path, kind: 'directory' });
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

/** A path the walk joined below an absolute root; throws for one that is not absolute, a bug. */
function parseWalkedPath(params: { run: ExploreProbeToolRun; text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: params.run.environment.pathRules, text: params.text });

  if (path.kind === 'failed') {
    throw new Error('The walk of iCloud Drive joined a path that is not absolute.');
  }

  return path.value;
}

/** An app's folder by the last part of its name: `iCloud~md~obsidian` is Obsidian's. */
function formatAppFolderName(params: { name: string }): string {
  const parts = params.name.split('~');

  return parts[parts.length - 1] ?? params.name;
}
