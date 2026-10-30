export type ScanIssue = {
  path: string;
  reason:
    | 'permissionDenied'
    | 'unexpected'
    | 'commandFailed'
    | 'walkStopped'
    | 'toolFailed'
    | 'toolUntrusted';
  detail: string;
};
