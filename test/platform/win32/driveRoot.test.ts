import { describe, expect, test } from 'bun:test';
import type { DriveRootFailure } from '../../../src/platform/win32/driveRoot.js';
import { parseDriveRoot } from '../../../src/platform/win32/driveRoot.js';
import type { Result } from '../../../src/result.js';

describe('parseDriveRoot', () => {
  test('takes a letter, a colon and a backslash, in either case', () => {
    for (const text of ['C:\\', 'd:\\', 'Z:\\']) {
      // Widened to its text, which the brand of a drive root only marks as checked.
      const parsed: Result<string, DriveRootFailure> = parseDriveRoot({ text: text });

      expect(parsed).toEqual({ kind: 'succeeded', value: text });
    }
  });

  test('refuses the empty root, which the shell would take for every drive', () => {
    expect(parseDriveRoot({ text: '' })).toEqual({
      kind: 'failed',
      failure: { reason: 'notDriveRoot' },
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
      expect(parseDriveRoot({ text: text })).toEqual({
        kind: 'failed',
        failure: { reason: 'notDriveRoot' },
      });
    }
  });
});
