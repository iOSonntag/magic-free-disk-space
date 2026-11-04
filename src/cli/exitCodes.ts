/** The exit codes of the CLI's own ends; a signal that ends the app exits with its code of the tools slice. */
export const EXIT_CODES = {
  done: 0,
  removalFailed: 1,
  cannotStart: 2,
  notInteractive: 3,
  journalUnavailable: 4,
} as const;
