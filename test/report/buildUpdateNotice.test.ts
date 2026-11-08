import { describe, expect, test } from 'bun:test';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import { buildUpdateNotice } from '../../src/report/buildUpdateNotice.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';

const TEXTS = darwinPlatform.report;

describe('buildUpdateNotice', () => {
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

  test('tells a Windows user to run the new setup', () => {
    const notice = buildUpdateNotice({
      outcome: {
        kind: 'newer',
        current: { major: 1, minor: 2, patch: 0 },
        latest: { major: 1, minor: 3, patch: 0 },
      },
      texts: win32Platform.report,
    });

    expect(notice?.lines).toEqual([
      'You have version 1.2.0.',
      'Download the new setup from the release page and run it.',
    ]);
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
