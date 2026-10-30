import { dirname } from 'node:path';
import type { ProjectArtifactRule } from '../catalog/projectArtifactRules.js';
import type { TreeEntry, TreeEntryVisit } from '../system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import { buildFailureIssues } from './buildReadIssue.js';
import type { ScanIssue } from './issue.js';

export type ArtifactFinding = {
  artifactPath: string;
  projectRoot: string;
  rule: ProjectArtifactRule;
};

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Returns the artifact folders under `homeDir` whose project folder holds a marker file,
 * sorted by path, with the issues of the walk. Symbolic links are never followed; a passed
 * `deadlineMs` stops the walk with one `walkStopped` issue.
 */
export async function findProjectArtifacts(params: {
  homeDir: string;
  excludedTopNames: string[];
  rules: ProjectArtifactRule[];
  maxDepth: number;
  deadlineMs: number;
}): Promise<{ findings: ArtifactFinding[]; issues: ScanIssue[] }> {
  const artifactNames = new Set(params.rules.map((rule) => rule.artifactName));
  const findings: ArtifactFinding[] = [];
  const issues: ScanIssue[] = [];

  function visitProjectEntry(entry: TreeEntry): TreeEntryVisit {
    // Only real folders count: a symbolic link is never followed.
    if (entry.kind !== 'directory') {
      return 'skip';
    }

    if (entry.depth === 1 && params.excludedTopNames.includes(entry.name)) {
      return 'skip';
    }

    if (artifactNames.has(entry.name)) {
      const markedRule = params.rules.find(
        (rule) =>
          rule.artifactName === entry.name &&
          rule.markerNames.some((markerName) => entry.siblingNames.has(markerName)),
      );

      if (markedRule !== undefined) {
        findings.push({
          artifactPath: entry.path,
          projectRoot: dirname(entry.path),
          rule: markedRule,
        });
      }

      return 'skip';
    }

    if (entry.name.startsWith('.') || entry.depth >= params.maxDepth) {
      return 'skip';
    }

    return 'descend';
  }

  const walkEnd = await walkDirectoryTree({
    rootPath: params.homeDir,
    isStatsNeeded: false,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    visitEntry: visitProjectEntry,
    onUnreadable: (unreadable) => {
      issues.push(...buildFailureIssues({ path: unreadable.path, failure: unreadable.failure }));
    },
  });

  if (walkEnd === 'stopped') {
    issues.push({ path: params.homeDir, reason: 'walkStopped', detail: 'deadline' });
  }

  return {
    findings: findings.toSorted((left, right) => (left.artifactPath < right.artifactPath ? -1 : 1)),
    issues: issues,
  };
}
