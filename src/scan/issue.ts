import type { ExploreEngineAnswerFailure } from '../explore/exploreProbe.js';
import type { ExploreToolFailure } from '../explore/exploreUnit.js';
import type { ToolDistrustDetail } from '../tools/decideToolTrust.js';

/** A place the scan could not read in full; `detail` is the text of the error, as is. */
export type ScanIssuePlace = {
  path: string;
  reason:
    | 'privacyDenied'
    | 'permissionDenied'
    | 'inUse'
    | 'unexpected'
    | 'commandFailed'
    | 'walkStopped';
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

/** The engine behind the socket at `path` answered, but not as asked, so its entry fell back to advice. */
export type ScanIssueEngineFailed = {
  path: string;
  reason: 'engineFailed';
  failure: ExploreEngineAnswerFailure;
};

export type ScanIssue =
  | ScanIssuePlace
  | ScanIssueToolFailed
  | ScanIssueToolUntrusted
  | ScanIssueEngineFailed;
