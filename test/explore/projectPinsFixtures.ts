import type { ExploreFileUnreadable } from '../../src/explore/exploreUnit.js';
import type { ProjectPinsLoad } from '../../src/explore/projectPins/loadProjectPins.js';
import type {
  ProjectPinFile,
  ProjectPinFileKind,
  ProjectPins,
} from '../../src/explore/projectPins/projectPins.js';
import type { Result } from '../../src/result.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

/** A pin file whose text was read. */
export function buildTestPinFileText(params: {
  path: string;
  kind: ProjectPinFileKind;
  text: string;
}): ProjectPinFile {
  return {
    path: buildTestAbsolutePath({ text: params.path }),
    kind: params.kind,
    content: { kind: 'text', text: params.text },
  };
}

/** A pin file that is there but too large or no file. */
export function buildTestPinFileUnfit(params: {
  path: string;
  kind: ProjectPinFileKind;
}): ProjectPinFile {
  return {
    path: buildTestAbsolutePath({ text: params.path }),
    kind: params.kind,
    content: { kind: 'unfit' },
  };
}

/** A pin file whose read failed with `permissionDenied`. */
export function buildTestPinFileUnreadable(params: {
  path: string;
  kind: ProjectPinFileKind;
}): ProjectPinFile {
  return {
    path: buildTestAbsolutePath({ text: params.path }),
    kind: params.kind,
    content: {
      kind: 'unreadable',
      failure: {
        reason: 'fileUnreadable',
        path: params.path,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    },
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

/** A load whose walk ended without finding any pin file. */
export function buildEmptyProjectPinsLoad(): ProjectPinsLoad {
  return buildSettledProjectPinsLoad({
    pins: { kind: 'succeeded', value: buildTestProjectPins({ files: [] }) },
  });
}
