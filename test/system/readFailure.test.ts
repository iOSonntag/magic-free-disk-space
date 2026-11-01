import { describe, expect, test } from 'bun:test';
import { decideReadFailure } from '../../src/system/readFailure.js';

describe('decideReadFailure', () => {
  test('a missing entry or a path through a file is absent', () => {
    expect(decideReadFailure({ reason: 'missing', code: 'ENOENT' })).toEqual({ kind: 'absent' });
    expect(decideReadFailure({ reason: 'notDirectory', code: 'ENOTDIR' })).toEqual({
      kind: 'absent',
    });
  });

  test('an entry of another kind or too large is unfit', () => {
    expect(decideReadFailure({ reason: 'notFile' })).toEqual({ kind: 'unfit' });
    expect(decideReadFailure({ reason: 'tooLarge', maxBytes: 8 })).toEqual({ kind: 'unfit' });
  });

  test('a denial by macOS privacy protection fails as privacyDenied', () => {
    expect(decideReadFailure({ reason: 'permissionDenied', code: 'EPERM' })).toEqual({
      kind: 'failed',
      failure: { reason: 'privacyDenied', code: 'EPERM' },
    });
  });

  test('a denied or unexpected read fails with its reason and code', () => {
    expect(decideReadFailure({ reason: 'permissionDenied', code: 'EACCES' })).toEqual({
      kind: 'failed',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
    expect(decideReadFailure({ reason: 'unexpected', code: 'EIO' })).toEqual({
      kind: 'failed',
      failure: { reason: 'unexpected', code: 'EIO' },
    });
  });
});
