export type ScanIssue = {
  path: string;
  reason: 'permissionDenied' | 'unexpected' | 'commandFailed' | 'walkStopped';
  detail: string;
};
