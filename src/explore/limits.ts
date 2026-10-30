/** The most bytes a probe reads of one file a tool keeps, such as an ini, a `package.xml`, or a registry. */
export const EXPLORE_FILE_MAX_BYTES = 8 * 1024 * 1024;

/** Past the deadline only work that ignores it is raced out; each command names its tool first. */
export const EXPLORE_PROBE_DEADLINE_GRACE_MS = 1000;
