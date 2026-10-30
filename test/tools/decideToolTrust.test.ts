import { describe, expect, test } from 'bun:test';
import { decideToolTrust } from '../../src/tools/decideToolTrust.js';

const USER_ID = 501;

const OTHER_USER_ID = 502;

describe('decideToolTrust', () => {
  test('trusts an executable file of the user or of root', () => {
    for (const ownerUserId of [USER_ID, 0]) {
      const trust = decideToolTrust({
        stats: { isRegularFile: true, mode: 0o100755, ownerUserId: ownerUserId },
        userId: USER_ID,
      });

      expect(trust).toEqual({ isTrusted: true });
    }
  });

  test('distrusts a file of another user', () => {
    const trust = decideToolTrust({
      stats: { isRegularFile: true, mode: 0o100755, ownerUserId: OTHER_USER_ID },
      userId: USER_ID,
    });

    expect(trust).toEqual({ isTrusted: false, detail: 'foreignOwner' });
  });

  test('distrusts a file its group or others can write', () => {
    for (const mode of [0o100775, 0o100757, 0o100777]) {
      const trust = decideToolTrust({
        stats: { isRegularFile: true, mode: mode, ownerUserId: 0 },
        userId: USER_ID,
      });

      expect(trust).toEqual({ isTrusted: false, detail: 'writableByOthers' });
    }
  });

  test('distrusts a file without an execute bit, and anything but a regular file', () => {
    const notExecutable = decideToolTrust({
      stats: { isRegularFile: true, mode: 0o100644, ownerUserId: USER_ID },
      userId: USER_ID,
    });
    const folder = decideToolTrust({
      stats: { isRegularFile: false, mode: 0o40755, ownerUserId: USER_ID },
      userId: USER_ID,
    });

    expect(notExecutable).toEqual({ isTrusted: false, detail: 'notExecutableFile' });
    expect(folder).toEqual({ isTrusted: false, detail: 'notExecutableFile' });
  });
});
