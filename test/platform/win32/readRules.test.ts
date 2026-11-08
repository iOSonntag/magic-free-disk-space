import { describe, expect, test } from 'bun:test';
import {
  loadFullDiskAccess,
  WIN32_PRIVACY_DENIAL_CODE,
} from '../../../src/platform/win32/readRules.js';
import { getDirectoryFailure } from '../../../src/system/loadDirectoryNames.js';
import { getFileFailure } from '../../../src/system/loadFileIdentity.js';
import { decideReadFailure } from '../../../src/system/readFailure.js';

describe('the read rules of Windows', () => {
  test('read EPERM and EACCES both as a denied permission, with no privacy denial', () => {
    for (const code of ['EPERM', 'EACCES']) {
      expect(
        decideReadFailure({
          failure: getFileFailure({ code: code }),
          privacyDenialCode: WIN32_PRIVACY_DENIAL_CODE,
        }),
      ).toEqual({ kind: 'failed', failure: { reason: 'permissionDenied', code: code } });
    }
  });

  test('read EBUSY of a file or a folder as an entry in use by another program', () => {
    for (const failure of [
      getFileFailure({ code: 'EBUSY' }),
      getDirectoryFailure({ code: 'EBUSY' }),
    ]) {
      expect(
        decideReadFailure({ failure: failure, privacyDenialCode: WIN32_PRIVACY_DENIAL_CODE }),
      ).toEqual({ kind: 'failed', failure: { reason: 'inUse', code: 'EBUSY' } });
    }
  });

  test('leave Full Disk Access unknown, which Windows does not have', async () => {
    expect(await loadFullDiskAccess()).toBe('unknown');
  });
});
