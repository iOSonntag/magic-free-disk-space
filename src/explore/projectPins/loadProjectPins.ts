import { basename, dirname } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryEntries,
  loadExploreDirectoryNames,
  loadExploreFileText,
  loadExploreRealPath,
} from '../loadExploreRead.js';
import type { ProjectPinFile, ProjectPinFileRef, ProjectPins } from './projectPins.js';
import { matchProjectPinFile } from './projectPins.js';

/** mise's folder of links to every config it used, below the home folder. */
const MISE_TRACKED_CONFIGS_PATH_NAMES = ['.local', 'state', 'mise', 'tracked-configs'];

/**
 * The pins of a scan as they come: `walkEnded` settles once the project walk ended, and `pins`
 * once its pin files and mise's tracked configs are read. Neither rejects.
 */
export type ProjectPinsLoad = {
  walkEnded: Promise<void>;
  pins: Promise<Result<ProjectPins, ExploreFileUnreadable>>;
};

/**
 * Reads the pin files the walk found and those of mise's tracked configs. Fails only when the
 * tracked configs cannot be read, since the tool of such a link is unknown.
 */
export async function loadProjectPins(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  walkedPinFiles: ProjectPinFileRef[];
  isWalkComplete: boolean;
  privacyDenialCode: string | null;
}): Promise<Result<ProjectPins, ExploreFileUnreadable>> {
  const trackedPinFiles = await loadMiseTrackedConfigPinFiles({
    pathRules: params.pathRules,
    homeDir: params.homeDir,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (trackedPinFiles.kind === 'failed') {
    return trackedPinFiles;
  }

  const files = await loadProjectPinFiles({
    files: [...params.walkedPinFiles, ...trackedPinFiles.value],
    privacyDenialCode: params.privacyDenialCode,
  });

  return { kind: 'succeeded', value: { files: files, isWalkComplete: params.isWalkComplete } };
}

/**
 * The refs of the pin files mise tracks, each at the real path of its link. A missing folder
 * tracks none; a dangling link or an entry that is no link is skipped.
 */
async function loadMiseTrackedConfigPinFiles(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ProjectPinFileRef[], ExploreFileUnreadable>> {
  const folderPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: MISE_TRACKED_CONFIGS_PATH_NAMES,
  });
  const entries = await loadExploreDirectoryEntries({
    path: folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: [] };
  }

  const linkPinFiles = await Promise.all(
    entries.value
      .filter((entry) => entry.kind === 'symbolicLink')
      .map((entry) =>
        loadMiseTrackedConfigPinFile({
          pathRules: params.pathRules,
          linkPath: joinAbsolutePath({
            rules: params.pathRules,
            parentPath: folderPath,
            names: [entry.name],
          }),
          privacyDenialCode: params.privacyDenialCode,
        }),
      ),
  );
  const refs: ProjectPinFileRef[] = [];

  for (const linkPinFile of linkPinFiles) {
    if (linkPinFile.kind === 'failed') {
      return linkPinFile;
    }

    if (linkPinFile.value !== null) {
      refs.push(linkPinFile.value);
    }
  }

  return { kind: 'succeeded', value: refs };
}

/** The ref of the link's target, or `null` when the target is gone or has no pin file name. */
async function loadMiseTrackedConfigPinFile(params: {
  pathRules: PathRules;
  linkPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ProjectPinFileRef | null, ExploreFileUnreadable>> {
  const realPath = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: params.linkPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (realPath.kind === 'failed') {
    return realPath;
  }

  if (realPath.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const siblingNames = await loadExploreDirectoryNames({
    path: dirname(realPath.value),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (siblingNames.kind === 'failed') {
    return siblingNames;
  }

  if (siblingNames.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const kind = matchProjectPinFile({
    name: basename(realPath.value),
    siblingNames: new Set(siblingNames.value),
    source: 'miseTrackedConfig',
  });

  if (kind === null) {
    return { kind: 'succeeded', value: null };
  }

  return { kind: 'succeeded', value: { path: realPath.value, kind: kind } };
}

/**
 * Reads each pin file once, by path, with the kind it came with. A file that is gone drops out; a
 * failed read is kept as `unreadable`, for the probe of its tool to fail on.
 */
export async function loadProjectPinFiles(params: {
  files: ProjectPinFileRef[];
  privacyDenialCode: string | null;
}): Promise<ProjectPinFile[]> {
  const loaded = await Promise.all(
    dedupeProjectPinFileRefs({ files: params.files }).map((file) =>
      loadProjectPinFile({ file: file, privacyDenialCode: params.privacyDenialCode }),
    ),
  );

  return loaded.flatMap((file) => (file === null ? [] : [file]));
}

/** `null` when nothing is at the path any more. */
async function loadProjectPinFile(params: {
  file: ProjectPinFileRef;
  privacyDenialCode: string | null;
}): Promise<ProjectPinFile | null> {
  const read = await loadExploreFileText({
    path: params.file.path,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (read.kind === 'failed') {
    return { ...params.file, content: { kind: 'unreadable', failure: read.failure.failure } };
  }

  switch (read.value.kind) {
    case 'absent':
      return null;
    case 'unfit':
    case 'text':
      return { ...params.file, content: read.value };
  }
}

/** The first ref of each path, in their order. */
function dedupeProjectPinFileRefs(params: { files: ProjectPinFileRef[] }): ProjectPinFileRef[] {
  const seenPaths = new Set<string>();
  const unique: ProjectPinFileRef[] = [];

  for (const file of params.files) {
    if (seenPaths.has(file.path)) {
      continue;
    }

    seenPaths.add(file.path);
    unique.push(file);
  }

  return unique;
}
