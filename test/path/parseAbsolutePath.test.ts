import { describe, expect, test } from 'bun:test';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { Result } from '../../src/result.js';

function parseText(params: { rules: 'posix' | 'win32'; text: string }): Result<string, string> {
  return parseAbsolutePath({
    rules: params.rules === 'posix' ? DARWIN_PATH_RULES : WIN32_PATH_RULES,
    text: params.text,
  });
}

describe('parseAbsolutePath', () => {
  test('takes an absolute POSIX path as it is', () => {
    for (const text of ['/', '/Users/tester/../x', '/a//b/']) {
      expect(parseText({ rules: 'posix', text: text })).toEqual({ kind: 'succeeded', value: text });
    }
  });

  test('refuses a relative POSIX path and one that reads as an option', () => {
    for (const text of ['', 'Users', './x', '-rf', 'C:\\Users']) {
      expect(parseText({ rules: 'posix', text: text }).kind).toBe('failed');
    }
  });

  test('normalizes a Windows drive path to backslashes and an upper-case drive letter', () => {
    const cases: { text: string; value: string }[] = [
      { text: 'C:\\', value: 'C:\\' },
      { text: 'c:\\Users\\tester', value: 'C:\\Users\\tester' },
      { text: 'd:/Data/./x/../y', value: 'D:\\Data\\y' },
    ];

    for (const parseCase of cases) {
      expect(parseText({ rules: 'win32', text: parseCase.text })).toEqual({
        kind: 'succeeded',
        value: parseCase.value,
      });
    }
  });

  test('refuses a share, a device path, and a path that names no drive root', () => {
    for (const text of [
      '\\\\server\\share\\x',
      '//server/share/x',
      '\\\\?\\C:\\Users',
      '\\\\.\\C:\\Users',
      'C:Users',
      'C:',
      '\\Users',
      '/Users',
      'Users',
      '',
    ]) {
      expect(parseText({ rules: 'win32', text: text }).kind).toBe('failed');
    }
  });

  test('refuses a path that holds a NUL character under either rules', () => {
    expect(parseText({ rules: 'win32', text: 'C:\\Users\\tester\0\\AppData' }).kind).toBe('failed');
    expect(parseText({ rules: 'win32', text: 'C:\\\0' }).kind).toBe('failed');
    expect(parseText({ rules: 'posix', text: '/Users/tester\0/Library' }).kind).toBe('failed');
  });
});
