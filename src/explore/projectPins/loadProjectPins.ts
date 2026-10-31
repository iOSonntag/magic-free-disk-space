import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreFileText } from '../loadExploreRead.js';
import type { ProjectPinFile, ProjectPinFileRef, ProjectPins } from './projectPins.js';

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
  homeDir: AbsolutePath;
  walkedPinFiles: ProjectPinFileRef[];
  isWalkComplete: boolean;
}): Promise<Result<ProjectPins, ExploreFileUnreadable>> {
  const files = await loadProjectPinFiles({ files: params.walkedPinFiles });

  return { kind: 'succeeded', value: { files: files, isWalkComplete: params.isWalkComplete } };
}

/**
 * Reads each pin file once, by path, with the kind it came with. A file that is gone drops out; a
 * failed read is kept as `unreadable`, for the probe of its tool to fail on.
 */
export async function loadProjectPinFiles(params: {
  files: ProjectPinFileRef[];
}): Promise<ProjectPinFile[]> {
  const loaded = await Promise.all(
    dedupeProjectPinFileRefs({ files: params.files }).map((file) =>
      loadProjectPinFile({ file: file }),
    ),
  );

  return loaded.flatMap((file) => (file === null ? [] : [file]));
}

/** `null` when nothing is at the path any more. */
async function loadProjectPinFile(params: {
  file: ProjectPinFileRef;
}): Promise<ProjectPinFile | null> {
  const read = await loadExploreFileText({ path: params.file.path });

  if (read.kind === 'failed') {
    return { ...params.file, content: { kind: 'unreadable', failure: read.failure } };
  }

  switch (read.value.kind) {
    case 'absent':
      return null;
    case 'unfit':
      return { ...params.file, content: { kind: 'unfit' } };
    case 'text':
      return { ...params.file, content: { kind: 'text', text: read.value.text } };
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
