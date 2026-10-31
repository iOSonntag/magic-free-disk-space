import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileKind,
  ProjectPinFileRef,
  ProjectPinFileText,
} from './projectPins.js';

/** A pin file of the tool could not be judged, so every version of the tool counts as pinned. */
export type ToolPinsEveryVersionPinned = { kind: 'everyVersionPinned' };

/** The texts of the tool's pin files, each with its kind, for the tool's own parse. */
export type ToolPinsTexts = { kind: 'texts'; files: ProjectPinFileText[] };

export type ToolPins = ToolPinsEveryVersionPinned | ToolPinsTexts;

/**
 * The pins of one tool, from the files of `kinds`: the first unreadable one fails, any unfit one
 * pins every version, and files of other kinds change nothing.
 */
export function selectToolPins(params: {
  pins: ProjectPinFile[];
  kinds: ProjectPinFileKind[];
}): Result<ToolPins, ExploreFileUnreadable> {
  const files: ProjectPinFileText[] = [];
  let isEveryVersionPinned = false;

  for (const file of params.pins) {
    if (!params.kinds.includes(file.kind)) {
      continue;
    }

    switch (file.content.kind) {
      case 'unreadable':
        return {
          kind: 'failed',
          failure: { reason: 'fileUnreadable', path: file.path, failure: file.content.failure },
        };
      case 'unfit':
        isEveryVersionPinned = true;
        break;
      case 'text':
        files.push({ path: file.path, kind: file.kind, text: file.content.text });
        break;
    }
  }

  if (isEveryVersionPinned) {
    return { kind: 'succeeded', value: { kind: 'everyVersionPinned' } };
  }

  return { kind: 'succeeded', value: { kind: 'texts', files: files } };
}

/**
 * The pin files a unit was judged by: those whose text was read, and none when every version is
 * pinned.
 */
export function listToolPinFileRefs(params: { toolPins: ToolPins }): ProjectPinFileRef[] {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return [];
    case 'texts':
      return params.toolPins.files.map((file) => ({ path: file.path, kind: file.kind }));
  }
}
