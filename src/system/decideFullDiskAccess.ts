/** Whether macOS lets this process into the folders that privacy protection guards. */
export type FullDiskAccess = 'granted' | 'denied' | 'unknown';

/** What opening one probe path gave. */
export type FullDiskAccessProbeOutcome = 'opened' | 'privacyDenied' | 'missing' | 'failed';
