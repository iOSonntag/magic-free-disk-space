import type { ExploreFileUnreadable } from '../../src/explore/exploreUnit.js';
import type { ProjectPinsLoad } from '../../src/explore/projectPins/loadProjectPins.js';
import type {
  ProjectPinFile,
  ProjectPinFileKind,
  ProjectPinFileText,
  ProjectPins,
} from '../../src/explore/projectPins/projectPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { Result } from '../../src/result.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

/** A pin file whose text was read. */
export function buildTestPinFileText(params: {
  path: AbsolutePath;
  kind: ProjectPinFileKind;
  text: string;
}): ProjectPinFile {
  return {
    path: params.path,
    kind: params.kind,
    content: { kind: 'text', text: params.text },
  };
}

/** The text of a pin file as a tool's pins hold it, at an example macOS `path`. */
export function buildTestPinText(params: {
  path: string;
  kind: ProjectPinFileKind;
  text: string;
}): ProjectPinFileText {
  return {
    path: buildTestAbsolutePath({ text: params.path }),
    kind: params.kind,
    text: params.text,
  };
}

/** A pin file that is there but too large or no file. */
export function buildTestPinFileUnfit(params: {
  path: AbsolutePath;
  kind: ProjectPinFileKind;
}): ProjectPinFile {
  return {
    path: params.path,
    kind: params.kind,
    content: { kind: 'unfit' },
  };
}

/** A pin file whose read failed with `permissionDenied`. */
export function buildTestPinFileUnreadable(params: {
  path: AbsolutePath;
  kind: ProjectPinFileKind;
}): ProjectPinFile {
  return {
    path: params.path,
    kind: params.kind,
    content: { kind: 'unreadable', failure: { reason: 'permissionDenied', code: 'EACCES' } },
  };
}

/** The pins of a scan whose walk was complete unless `isWalkComplete` says otherwise. */
export function buildTestProjectPins(params: {
  files: ProjectPinFile[];
  isWalkComplete?: boolean;
}): ProjectPins {
  return { files: params.files, isWalkComplete: params.isWalkComplete ?? true };
}

/** A load whose walk already ended, with `pins` already read. */
export function buildSettledProjectPinsLoad(params: {
  pins: Result<ProjectPins, ExploreFileUnreadable>;
}): ProjectPinsLoad {
  return { walkEnded: Promise.resolve(), pins: Promise.resolve(params.pins) };
}

/** A load whose complete walk found `files`, all read. */
export function buildFoundProjectPinsLoad(params: { files: ProjectPinFile[] }): ProjectPinsLoad {
  return buildSettledProjectPinsLoad({
    pins: { kind: 'succeeded', value: buildTestProjectPins({ files: params.files }) },
  });
}

/** A load whose walk ended without finding any pin file. */
export function buildEmptyProjectPinsLoad(): ProjectPinsLoad {
  return buildFoundProjectPinsLoad({ files: [] });
}
