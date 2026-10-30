import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import type { ToolDistrustDetail } from '../tools/decideToolTrust.js';

/** A place the scan could not read in full; `detail` is the text of the error, as is. */
export type ScanIssuePlace = {
  path: string;
  reason: 'permissionDenied' | 'unexpected' | 'commandFailed' | 'walkStopped';
  detail: string;
};

/** The tool at `path` ran its probe and failed, so its entry fell back to advice. */
export type ScanIssueToolFailed = {
  path: string;
  reason: 'toolFailed';
  failure: ExploreToolFailure;
};

/** The tool at `path` did not pass the trust check, so its entry fell back to advice. */
export type ScanIssueToolUntrusted = {
  path: string;
  reason: 'toolUntrusted';
  detail: ToolDistrustDetail;
};

export type ScanIssue = ScanIssuePlace | ScanIssueToolFailed | ScanIssueToolUntrusted;
