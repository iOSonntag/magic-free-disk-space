import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { ClaudeProjectEntry, ClaudeProjectState } from './loadClaudeProjectsState.js';

/** How long Claude Code itself keeps a transcript by default, its `cleanupPeriodDays`: 30 days. */
export const CLAUDE_TRANSCRIPT_UNTOUCHED_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A session's files in its project folder: `<session>.jsonl`, and the copies Claude Code sets
 * aside, `<session>.orphaned-<time>-<suffix>.jsonl` and `<session>.jsonl.superseded-<time>`.
 */
const SESSION_FILE_NAME_PATTERN = /^([^.]+)\.(jsonl$|jsonl\.superseded-|orphaned-.*\.jsonl$)/;

/** The project's memory folder, which Claude Code keeps at any age; never a session's. */
const MEMORY_FOLDER_NAME = 'memory';

type Session = { files: ClaudeProjectEntry[]; folder: ClaudeProjectEntry | null };

/** The old sessions of a project and the paths of their files and folders, sorted. */
export type OldTranscripts = { sessionCount: number; paths: AbsolutePath[] };

/**
 * The paths of the project's sessions whose every file, and whose own folder of subagents and tool
 * results, is untouched since `cutoffMs`. A folder no session file names, `memory` among them, and
 * every other file stay.
 */
export function decideOldTranscriptPaths(params: {
  project: ClaudeProjectState;
  cutoffMs: number;
}): OldTranscripts {
  const sessions = new Map<string, Session>();

  for (const entry of params.project.entries) {
    const sessionId = SESSION_FILE_NAME_PATTERN.exec(entry.name)?.[1];

    if (entry.kind !== 'file' || sessionId === undefined || sessionId === MEMORY_FOLDER_NAME) {
      continue;
    }

    const session = sessions.get(sessionId) ?? { files: [], folder: null };
    sessions.set(sessionId, { files: [...session.files, entry], folder: null });
  }

  for (const entry of params.project.entries) {
    const session = sessions.get(entry.name);

    if (entry.kind === 'directory' && session !== undefined) {
      sessions.set(entry.name, { files: session.files, folder: entry });
    }
  }

  const oldSessionEntries = [...sessions.values()]
    .map((session) => [...session.files, ...(session.folder === null ? [] : [session.folder])])
    .filter((entries) => entries.every((entry) => entry.modifiedMs < params.cutoffMs));

  return {
    sessionCount: oldSessionEntries.length,
    paths: oldSessionEntries.flatMap((entries) => entries.map((entry) => entry.path)).toSorted(),
  };
}
