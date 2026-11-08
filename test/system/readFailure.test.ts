import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { decideReadFailure } from '../../src/system/readFailure.js';

const PRIVACY_DENIAL_CODE = darwinPlatform.system.privacyDenialCode;

describe('decideReadFailure', () => {
  test('a missing entry or a path through a file is absent', () => {
    expect(
      decideReadFailure({
        failure: { reason: 'missing', code: 'ENOENT' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({ kind: 'absent' });
    expect(
      decideReadFailure({
        failure: { reason: 'notDirectory', code: 'ENOTDIR' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({
      kind: 'absent',
    });
  });

  test('an entry of another kind or too large is unfit', () => {
    expect(
      decideReadFailure({ failure: { reason: 'notFile' }, privacyDenialCode: PRIVACY_DENIAL_CODE }),
    ).toEqual({ kind: 'unfit' });
    expect(
      decideReadFailure({
        failure: { reason: 'tooLarge', maxBytes: 8 },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({ kind: 'unfit' });
  });

  test('a denial by macOS privacy protection fails as privacyDenied', () => {
    expect(
      decideReadFailure({
        failure: { reason: 'permissionDenied', code: 'EPERM' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({
      kind: 'failed',
      failure: { reason: 'privacyDenied', code: 'EPERM' },
    });
  });

  test('a denied or unexpected read fails with its reason and code', () => {
    expect(
      decideReadFailure({
        failure: { reason: 'permissionDenied', code: 'EACCES' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({
      kind: 'failed',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
    expect(
      decideReadFailure({
        failure: { reason: 'unexpected', code: 'EIO' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({
      kind: 'failed',
      failure: { reason: 'unexpected', code: 'EIO' },
    });
  });

  test('an entry another program holds open fails as inUse', () => {
    expect(
      decideReadFailure({
        failure: { reason: 'inUse', code: 'EBUSY' },
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      }),
    ).toEqual({ kind: 'failed', failure: { reason: 'inUse', code: 'EBUSY' } });
  });

  test('no permission failure is a privacy denial when the platform names no code for one', () => {
    expect(
      decideReadFailure({
        failure: { reason: 'permissionDenied', code: 'EPERM' },
        privacyDenialCode: null,
      }),
    ).toEqual({ kind: 'failed', failure: { reason: 'permissionDenied', code: 'EPERM' } });
  });
});
