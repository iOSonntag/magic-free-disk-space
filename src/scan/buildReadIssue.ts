import type { ReadFailure } from '../system/readFailure.js';
import type { ScanIssue } from './issue.js';

/** The place issue of a read that failed: its path, its reason, and its error code. */
export function buildReadIssue(params: { path: string; failure: ReadFailure }): ScanIssue {
  return { path: params.path, reason: params.failure.reason, detail: params.failure.code };
}
