import { expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { buildUpdateNotice } from '../../src/report/buildUpdateNotice.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';

const TEXTS = darwinPlatform.report;

describeAwaitingWin32Platform('buildUpdateNotice', () => {
  test('builds the notice of the protocol fixture for a newer release', async () => {
    const notice = buildUpdateNotice({
      outcome: {
        kind: 'newer',
        current: { major: 1, minor: 2, patch: 0 },
        latest: { major: 1, minor: 3, patch: 0 },
      },
      texts: TEXTS,
    });

    expect(await loadProtocolFixtureEventOfKind('updateChecked')).toEqual({
      kind: 'updateChecked',
      isUpdateCheckEnabled: true,
      notice: notice,
    });
  });

  test('stays silent for every other outcome', () => {
    expect(buildUpdateNotice({ outcome: { kind: 'off' }, texts: TEXTS })).toBeNull();
    expect(buildUpdateNotice({ outcome: { kind: 'unversioned' }, texts: TEXTS })).toBeNull();
    expect(buildUpdateNotice({ outcome: { kind: 'current' }, texts: TEXTS })).toBeNull();
    expect(
      buildUpdateNotice({ outcome: { kind: 'failed', reason: 'timedOut' }, texts: TEXTS }),
    ).toBeNull();
  });
});
