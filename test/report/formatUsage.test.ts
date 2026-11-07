import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { formatUsage } from '../../src/report/formatUsage.js';

describe('formatUsage', () => {
  test('lists the usage, the options with their defaults, and the exit codes', () => {
    expect(
      formatUsage({
        texts: darwinPlatform.report,
        processEndSignals: darwinPlatform.tools.processEndSignals,
      }).join('\n'),
    ).toBe(`Usage: bun start [options]
Finds storage leftovers on this Mac and permanently deletes the ones you select.

Options:
  --list                 Show what could be freed, then exit. Deletes nothing.
  --dry-run              Scan and show the removal plan. Deletes nothing.
  --select <selection>   With --dry-run: the items to plan, such as "1-3,7" or "safe".
  --stale-days <days>    Days without changes before temporary folders, app logs, project build folders, installers and unfinished downloads, and Mail's attachment copies count as stale (default 10).
  --unused-days <days>   Days without use before apps, large files, the data of removed apps, iCloud Drive files, simulator runtimes, and Android emulators count as unused (default 180).
  -h, --help             Show this help.

Exit codes: 0 done or cancelled, 1 a deletion failed or the log stopped the run, 2 bad usage, not macOS, or an unsafe setup, 3 no interactive terminal, 4 the deletion log could not be created, 129, 130, 131, 143 stopped by SIGHUP, SIGINT, SIGQUIT, or SIGTERM.`);
  });
});
