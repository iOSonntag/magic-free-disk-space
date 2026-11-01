import { describe, expect, test } from 'bun:test';
import { readFailureVerdictToFullDiskAccess } from '../../src/system/fullDiskAccess.js';

describe('readFailureVerdictToFullDiskAccess', () => {
  test('a privacy denial is denied', () => {
    expect(
      readFailureVerdictToFullDiskAccess({
        kind: 'failed',
        failure: { reason: 'privacyDenied', code: 'EPERM' },
      }),
    ).toBe('denied');
  });

  test('a POSIX denial decides nothing', () => {
    expect(
      readFailureVerdictToFullDiskAccess({
        kind: 'failed',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      }),
    ).toBe('unknown');
  });

  test('an unexpected failure decides nothing', () => {
    expect(
      readFailureVerdictToFullDiskAccess({
        kind: 'failed',
        failure: { reason: 'unexpected', code: 'EIO' },
      }),
    ).toBe('unknown');
  });

  test('an absent or unfit path decides nothing', () => {
    expect(readFailureVerdictToFullDiskAccess({ kind: 'absent' })).toBe('unknown');
    expect(readFailureVerdictToFullDiskAccess({ kind: 'unfit' })).toBe('unknown');
  });
});
