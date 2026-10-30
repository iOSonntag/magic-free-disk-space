import { SCAN_LIMITS } from '../scan/limits.js';

export function formatUsage(): string[] {
  return [
    'Usage: bun start [options]',
    'Finds storage leftovers on this Mac and permanently deletes the ones you select.',
    '',
    'Options:',
    '  --list                 Show what could be freed, then exit. Deletes nothing.',
    '  --dry-run              Scan and show the removal plan. Deletes nothing.',
    '  --select <selection>   With --dry-run: the items to plan, such as "1-3,7" or "safe".',
    `  --stale-days <days>    Days without changes before temporary folders and project build folders count as stale (default ${SCAN_LIMITS.defaultStaleDays}).`,
    `  --unused-days <days>   Days without use before apps, large files, and the data of removed apps count as unused (default ${SCAN_LIMITS.defaultUnusedDays}).`,
    '  -h, --help             Show this help.',
    '',
    'Exit codes: 0 done or cancelled, 1 a deletion failed or the log stopped the run, 2 bad usage, not macOS, or an unsafe setup, 3 no interactive terminal, 4 the deletion log could not be created, 129, 130, 131, 143 stopped by SIGHUP, SIGINT, SIGQUIT, or SIGTERM.',
  ];
}
