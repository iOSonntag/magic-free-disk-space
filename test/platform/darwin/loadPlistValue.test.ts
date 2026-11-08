import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadPlistValue } from '../../../src/platform/darwin/loadPlistValue.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../../src/system/limits.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import { withFixtureRoot } from '../../support/fixtureRoot.js';

const PLIST_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
<key>CFBundleIdentifier</key>
<string> com.example.app
</string>
<key>CFBundleName</key>
<string></string>
</dict>
</plist>
`;

describeAwaitingWin32Platform('loadPlistValue', () => {
  test('trims a value, keeps an empty one, and fails without the key or file', async () => {
    await withFixtureRoot({
      run: async (fixtureRoot) => {
        const plistPath = join(fixtureRoot.rootDir, 'Info.plist');

        await writeFile(plistPath, PLIST_TEXT);

        expect(
          await loadPlistValue({
            plistPath: plistPath,
            key: 'CFBundleIdentifier',
            timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
          }),
        ).toEqual({ kind: 'succeeded', value: 'com.example.app' });
        expect(
          await loadPlistValue({
            plistPath: plistPath,
            key: 'CFBundleName',
            timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
          }),
        ).toEqual({ kind: 'succeeded', value: '' });

        for (const missing of [
          { plistPath: plistPath, key: 'DTPlatformVersion' },
          { plistPath: join(fixtureRoot.rootDir, 'Missing.plist'), key: 'CFBundleIdentifier' },
        ]) {
          expect(
            await loadPlistValue({
              plistPath: missing.plistPath,
              key: missing.key,
              timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
            }),
          ).toMatchObject({ kind: 'failed', failure: { reason: 'exitedWithError' } });
        }
      },
    });
  });
});
