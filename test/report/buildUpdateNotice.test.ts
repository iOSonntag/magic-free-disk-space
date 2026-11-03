import { describe, expect, test } from 'bun:test';
import { buildUpdateNotice } from '../../src/report/buildUpdateNotice.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';

describe.skipIf(AWAITS_WIN32_PLATFORM)('buildUpdateNotice', () => {
  test('builds the notice of the protocol fixture for a newer release', async () => {
    const notice = buildUpdateNotice({
      kind: 'newer',
      current: { major: 1, minor: 2, patch: 0 },
      latest: { major: 1, minor: 3, patch: 0 },
    });

    expect(await loadProtocolFixtureEventOfKind('updateChecked')).toEqual({
      kind: 'updateChecked',
      isUpdateCheckEnabled: true,
      notice: notice,
    });
  });

  test('stays silent for every other outcome', () => {
    expect(buildUpdateNotice({ kind: 'off' })).toBeNull();
    expect(buildUpdateNotice({ kind: 'unversioned' })).toBeNull();
    expect(buildUpdateNotice({ kind: 'current' })).toBeNull();
    expect(buildUpdateNotice({ kind: 'failed', reason: 'timedOut' })).toBeNull();
  });
});
