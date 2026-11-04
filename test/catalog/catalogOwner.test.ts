import { describe, expect, test } from 'bun:test';
import { parseMacBundleId } from '../../src/catalog/catalogOwner.js';
import type { Result } from '../../src/result.js';

describe('parseMacBundleId', () => {
  test('accepts the id of a bundle', () => {
    const parsed: Result<string, string> = parseMacBundleId({ text: 'com.apple.dt.Xcode' });

    expect(parsed).toEqual({ kind: 'succeeded', value: 'com.apple.dt.Xcode' });
  });

  test('refuses an empty text', () => {
    expect(parseMacBundleId({ text: '' })).toEqual({
      kind: 'failed',
      failure: 'an empty bundle id',
    });
  });
});
