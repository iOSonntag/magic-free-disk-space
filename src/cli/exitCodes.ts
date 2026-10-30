export const EXIT_CODES = {
  done: 0,
  removalFailed: 1,
  cannotStart: 2,
  notInteractive: 3,
  journalUnavailable: 4,
  /** 128 plus the number of the signal, as a shell reports a process that SIGINT ended. */
  interrupted: 130,
  /** 128 plus the number of SIGTERM. */
  terminated: 143,
} as const;
