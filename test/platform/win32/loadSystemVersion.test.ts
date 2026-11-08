import { expect, test } from 'bun:test';
import { loadSystemVersion } from '../../../src/platform/win32/loadSystemVersion.js';
import { describeOnWindows } from '../../support/windowsOnly.js';

describeOnWindows('loadSystemVersion on Windows', () => {
  test('reads the major, minor and build number of Windows', async () => {
    expect(await loadSystemVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
