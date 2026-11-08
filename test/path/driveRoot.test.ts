import { describe, expect, test } from 'bun:test';
import { parseDriveRoot } from '../../src/path/driveRoot.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import type { Result } from '../../src/result.js';

/** The drive root of `text` widened to its text, which the brand only marks as checked. */
function parseWindowsDriveRoot(params: { text: string }): Result<string, string> {
  return parseDriveRoot({ rules: WIN32_PATH_RULES, text: params.text });
}

describe('parseDriveRoot', () => {
  test('takes a letter, a colon and a backslash, the letter upper-cased', () => {
    const cases: { text: string; value: string }[] = [
      { text: 'C:\\', value: 'C:\\' },
      { text: 'd:\\', value: 'D:\\' },
      { text: 'Z:\\', value: 'Z:\\' },
    ];

    for (const parseCase of cases) {
      expect(parseWindowsDriveRoot({ text: parseCase.text })).toEqual({
        kind: 'succeeded',
        value: parseCase.value,
      });
    }
  });

  test('refuses the empty root, which the shell would take for every drive', () => {
    expect(parseWindowsDriveRoot({ text: '' })).toEqual({
      kind: 'failed',
      failure: 'not a drive root',
    });
  });

  test('refuses a drive without its backslash, a folder, a share, and other separators', () => {
    for (const text of [
      'C:',
      'C:/',
      'C:\\Users',
      'C:\\\\',
      '\\\\server\\share\\',
      '\\\\?\\C:\\',
      'CD:\\',
      '1:\\',
      ' C:\\',
      'C:\\ ',
      '/',
    ]) {
      expect(parseWindowsDriveRoot({ text: text })).toEqual({
        kind: 'failed',
        failure: 'not a drive root',
      });
    }
  });

  test('refuses every text under the POSIX rules, whose file system has no drive', () => {
    for (const text of ['/', 'C:\\', '/Volumes/Data']) {
      expect(parseDriveRoot({ rules: POSIX_PATH_RULES, text: text })).toEqual({
        kind: 'failed',
        failure: 'not a drive root',
      });
    }
  });
});
