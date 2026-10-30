import type { DirectoryFailure } from '../system/loadDirectoryNames.js';
import type { FileFailure } from '../system/loadFileIdentity.js';
import type { ReadFailure } from '../system/readFailure.js';
import { decideReadFailure } from '../system/readFailure.js';
import type { ScanIssue } from './issue.js';

/** The place issue of a read that failed: its path, its reason, and its error code. */
export function buildReadIssue(params: { path: string; failure: ReadFailure }): ScanIssue {
  return { path: params.path, reason: params.failure.reason, detail: params.failure.code };
}

/** The issues of a failed read of a path: none when `decideReadFailure` finds it absent or unfit. */
export function buildFailureIssues(params: {
  path: string;
  failure: FileFailure | DirectoryFailure;
}): ScanIssue[] {
  const verdict = decideReadFailure(params.failure);

  switch (verdict.kind) {
    case 'absent':
    case 'unfit':
      return [];
    case 'failed':
      return [buildReadIssue({ path: params.path, failure: verdict.failure })];
  }
}
