/** A button that opens a pane of System Settings; `failedText` shows when it could not open. */
export type SettingsLinkView = { labelText: string; url: string; failedText: string };

/** A block of guidance the app shows apart from the items: every text is safe to show. */
export type NoticeView = {
  titleText: string;
  lines: string[];
  settingsLink: SettingsLinkView | null;
};

/**
 * The pane of Full Disk Access. Both the notice of a scan that met a privacy denial and the
 * banner at start carry this one link, so a pane renamed by macOS changes in one place.
 */
export const FULL_DISK_ACCESS_SETTINGS_LINK: SettingsLinkView = {
  labelText: 'Open System Settings',
  url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  failedText:
    'System Settings did not open. Open it yourself and go to Privacy & Security > Full Disk Access.',
};
