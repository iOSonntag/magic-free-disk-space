import { describe, expect, test } from 'bun:test';
import {
  getErrorCode,
  isInUseErrorCode,
  isPermissionDeniedErrorCode,
} from '../../src/system/getErrorCode.js';

describe('getErrorCode', () => {
  test('reads the code of an error, and names any other throw unknown', () => {
    expect(getErrorCode(Object.assign(new Error('busy'), { code: 'EBUSY' }))).toBe('EBUSY');
    expect(getErrorCode(new Error('plain'))).toBe('unknown');
    expect(getErrorCode('text')).toBe('unknown');
  });
});

describe('isInUseErrorCode', () => {
  test('is true for an entry another program holds open, and only for it', () => {
    expect(isInUseErrorCode('EBUSY')).toBe(true);
    expect(isInUseErrorCode('EPERM')).toBe(false);
    expect(isInUseErrorCode('ENOENT')).toBe(false);
  });
});

describe('isPermissionDeniedErrorCode', () => {
  test('is true for a refused call, and only for it', () => {
    expect(isPermissionDeniedErrorCode('EACCES')).toBe(true);
    expect(isPermissionDeniedErrorCode('EPERM')).toBe(true);
    expect(isPermissionDeniedErrorCode('EBUSY')).toBe(false);
  });
});
