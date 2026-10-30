import { describe, expect, test } from 'bun:test';
import { buildReadIssue } from '../../src/scan/buildReadIssue.js';

describe('buildReadIssue', () => {
  test('reports the path with the reason of the failure and its code as the detail', () => {
    expect(
      buildReadIssue({
        path: '/Users/example/Library/Locked',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      }),
    ).toEqual({
      path: '/Users/example/Library/Locked',
      reason: 'permissionDenied',
      detail: 'EACCES',
    });
    expect(
      buildReadIssue({
        path: '/Users/example/Loop/inside',
        failure: { reason: 'unexpected', code: 'ELOOP' },
      }),
    ).toEqual({ path: '/Users/example/Loop/inside', reason: 'unexpected', detail: 'ELOOP' });
  });
});
