import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPlistProductVersion } from '../../../src/platform/darwin/loadSystemVersion.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';

const SYSTEM_VERSION_PLIST_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>ProductVersion</key>
<string>26.2</string>
</dict>
</plist>
`;

const EMPTY_PLIST_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
</dict>
</plist>
`;

describeAwaitingWin32Platform('loadPlistProductVersion', () => {
  test('reads the product version of a plist, and null for none or no file', async () => {
    const fixtureRoot = await createFixtureRoot();

    try {
      const plistPath = join(fixtureRoot.rootDir, 'SystemVersion.plist');
      const emptyPlistPath = join(fixtureRoot.rootDir, 'Empty.plist');

      await writeFile(plistPath, SYSTEM_VERSION_PLIST_TEXT);
      await writeFile(emptyPlistPath, EMPTY_PLIST_TEXT);

      expect(await loadPlistProductVersion({ plistPath: plistPath })).toBe('26.2');
      expect(await loadPlistProductVersion({ plistPath: emptyPlistPath })).toBeNull();
      expect(
        await loadPlistProductVersion({ plistPath: join(fixtureRoot.rootDir, 'Missing.plist') }),
      ).toBeNull();
    } finally {
      await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
    }
  });
});
