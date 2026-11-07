import { basename } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreDirectoryEntries, loadExploreEntryStats } from '../loadExploreRead.js';

/** Claude Code's transcripts below the home folder, one folder per project. */
export const CLAUDE_PROJECTS_PATH_NAMES = ['.claude', 'projects'];

/** A file or a folder directly in a project folder; a link there is never one. */
export type ClaudeProjectEntry = {
  name: string;
  path: AbsolutePath;
  kind: 'file' | 'directory';
  modifiedMs: number;
};

/** One project folder of Claude Code with its entries. */
export type ClaudeProjectState = {
  folderName: string;
  path: AbsolutePath;
  entries: ClaudeProjectEntry[];
};

/** Every project folder below `~/.claude/projects`; none when it is absent. */
export async function loadClaudeProjectsState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ClaudeProjectState[], ExploreFileUnreadable>> {
  const projectsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: CLAUDE_PROJECTS_PATH_NAMES,
  });
  const entries = await loadExploreDirectoryEntries({
    path: projectsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const projects: ClaudeProjectState[] = [];

  for (const entry of entries.value ?? []) {
    if (entry.kind !== 'directory') {
      continue;
    }

    const project = await loadClaudeProjectState({
      pathRules: params.pathRules,
      projectFolderPath: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: projectsPath,
        names: [entry.name],
      }),
      privacyDenialCode: params.privacyDenialCode,
    });

    if (project.kind === 'failed') {
      return project;
    }

    if (project.value !== null) {
      projects.push(project.value);
    }
  }

  return { kind: 'succeeded', value: projects };
}

/** The files and folders of one project folder with their times; `null` when it is absent. */
export async function loadClaudeProjectState(params: {
  pathRules: PathRules;
  projectFolderPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ClaudeProjectState | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.projectFolderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const projectEntries: ClaudeProjectEntry[] = [];

  for (const entry of entries.value) {
    const kind = entry.kind;

    if (kind !== 'file' && kind !== 'directory') {
      continue;
    }

    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.projectFolderPath,
      names: [entry.name],
    });
    const stats = await loadExploreEntryStats({
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    if (stats.value !== null && stats.value.kind === kind) {
      projectEntries.push({
        name: entry.name,
        path: path,
        kind: kind,
        modifiedMs: stats.value.modifiedMs,
      });
    }
  }

  return {
    kind: 'succeeded',
    value: {
      folderName: basename(params.projectFolderPath),
      path: params.projectFolderPath,
      entries: projectEntries,
    },
  };
}
