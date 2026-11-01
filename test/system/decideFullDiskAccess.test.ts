import { describe, expect, test } from 'bun:test';
import {
  decideFullDiskAccess,
  readFailureVerdictToProbeOutcome,
} from '../../src/system/decideFullDiskAccess.js';

describe('decideFullDiskAccess', () => {
  test('an open TCC database means granted, a privacy denial of it denied', () => {
    expect(decideFullDiskAccess({ tccDatabase: 'opened' })).toBe('granted');
    expect(decideFullDiskAccess({ tccDatabase: 'privacyDenied' })).toBe('denied');
  });

  test('without an answer of the TCC database, the Safari folder decides', () => {
    for (const tccDatabase of ['missing', 'failed'] as const) {
      expect(decideFullDiskAccess({ tccDatabase: tccDatabase, safari: 'opened' })).toBe('granted');
      expect(decideFullDiskAccess({ tccDatabase: tccDatabase, safari: 'privacyDenied' })).toBe(
        'denied',
      );
      expect(decideFullDiskAccess({ tccDatabase: tccDatabase, safari: 'missing' })).toBe('unknown');
      expect(decideFullDiskAccess({ tccDatabase: tccDatabase, safari: 'failed' })).toBe('unknown');
    }
  });
});

describe('readFailureVerdictToProbeOutcome', () => {
  test('an absent path is missing', () => {
    expect(readFailureVerdictToProbeOutcome({ kind: 'absent' })).toBe('missing');
  });

  test('a privacy denial is privacyDenied', () => {
    expect(
      readFailureVerdictToProbeOutcome({
        kind: 'failed',
        failure: { reason: 'privacyDenied', code: 'EPERM' },
      }),
    ).toBe('privacyDenied');
  });

  test('a POSIX denial, an unexpected failure, or an unfit entry fails', () => {
    expect(
      readFailureVerdictToProbeOutcome({
        kind: 'failed',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      }),
    ).toBe('failed');
    expect(
      readFailureVerdictToProbeOutcome({
        kind: 'failed',
        failure: { reason: 'unexpected', code: 'EIO' },
      }),
    ).toBe('failed');
    expect(readFailureVerdictToProbeOutcome({ kind: 'unfit' })).toBe('failed');
  });
});
