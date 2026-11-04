import { describe, expect, test } from 'bun:test';
import { parsePlatformId } from '../../src/platform/platform.js';

describe('parsePlatformId', () => {
  test('accepts the operating systems the app runs on', () => {
    expect(parsePlatformId({ text: 'darwin' })).toEqual({ kind: 'succeeded', value: 'darwin' });
    expect(parsePlatformId({ text: 'win32' })).toEqual({ kind: 'succeeded', value: 'win32' });
  });

  test('refuses any other operating system', () => {
    expect(parsePlatformId({ text: 'linux' })).toEqual({
      kind: 'failed',
      failure: { reason: 'unsupportedPlatform' },
    });
  });
});
