import { describe, expect, test } from 'bun:test';
import { parseMacBundleId } from '../../src/catalog/catalogOwner.js';

describe('parseMacBundleId', () => {
  test('keeps the id of a bundle as it is', () => {
    const parsedText: string = parseMacBundleId({ text: 'com.apple.dt.Xcode' });

    expect(parsedText).toBe('com.apple.dt.Xcode');
  });

  test('keeps an empty text as an id', () => {
    const parsedText: string = parseMacBundleId({ text: '' });

    expect(parsedText).toBe('');
  });
});
