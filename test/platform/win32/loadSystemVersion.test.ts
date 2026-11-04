import { describe, expect, test } from 'bun:test';
import { loadSystemVersion } from '../../../src/platform/win32/loadSystemVersion.js';

describe.skipIf(process.platform !== 'win32')('loadSystemVersion on Windows', () => {
  test('reads the major, minor and build number of Windows', async () => {
    expect(await loadSystemVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
