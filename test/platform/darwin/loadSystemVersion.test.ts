import { describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPlistVersion } from '../../../src/platform/darwin/loadSystemVersion.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../../src/system/limits.js';
import { withFixtureRoot } from '../../support/fixtureRoot.js';

const VERSIONS_PLIST_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>ProductVersion</key>
<string>26.2</string>
<key>DTPlatformVersion</key>
<string>15.4</string>
<key>CFBundleShortVersionString</key>
<string></string>
</dict>
</plist>
`;

// The version comes from `plutil`, which only macOS has.
describe.skipIf(process.platform !== 'darwin')('loadPlistVersion', () => {
  test('reads the version under the key, and null for an empty, missing or unread one', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const plistPath = join(fixtureRoot.rootDir, 'Versions.plist');

        await writeFile(plistPath, VERSIONS_PLIST_TEXT);

        for (const read of [
          { plistPath: plistPath, key: 'ProductVersion', version: '26.2' },
          { plistPath: plistPath, key: 'DTPlatformVersion', version: '15.4' },
          { plistPath: plistPath, key: 'CFBundleShortVersionString', version: null },
          { plistPath: plistPath, key: 'CFBundleVersion', version: null },
          {
            plistPath: join(fixtureRoot.rootDir, 'Missing.plist'),
            key: 'ProductVersion',
            version: null,
          },
        ]) {
          expect(
            await loadPlistVersion({
              plistPath: read.plistPath,
              key: read.key,
              timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
            }),
          ).toBe(read.version);
        }
      },
    });
  });
});
