import { describe, expect, test } from 'bun:test';
import { parseMacBundleId, parseWindowsImageName } from '../../src/catalog/catalogOwner.js';
import type { Result } from '../../src/result.js';

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

describe('parseWindowsImageName', () => {
  test('makes the file name of a program lower case, as Windows compares it', () => {
    const parsed: Result<string, string> = parseWindowsImageName({ text: 'Code.EXE' });

    expect(parsed).toEqual({ kind: 'succeeded', value: 'code.exe' });
  });

  test('keeps the spaces and dots of a file name', () => {
    const parsed: Result<string, string> = parseWindowsImageName({
      text: 'Microsoft Teams.v2.exe',
    });

    expect(parsed).toEqual({ kind: 'succeeded', value: 'microsoft teams.v2.exe' });
  });

  test('refuses an empty text, a dot folder, and a text holding a path or a wildcard', () => {
    for (const text of ['', '.', '..', 'bin\\code.exe', 'bin/code.exe', 'C:code.exe', 'co*.exe']) {
      expect(parseWindowsImageName({ text: text })).toEqual({
        kind: 'failed',
        failure: 'not a file name',
      });
    }
  });
});
