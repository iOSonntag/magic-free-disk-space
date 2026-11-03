import { describe, expect, test } from 'bun:test';
import { buildFullDiskAccessNotices } from '../../src/report/buildFullDiskAccessNotices.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';

describe.skipIf(AWAITS_WIN32_PLATFORM)('buildFullDiskAccessNotices', () => {
  test('gives the banner of the protocol fixture, with the Settings link, while access is denied', async () => {
    const notices = buildFullDiskAccessNotices('denied');

    expect(await loadProtocolFixtureEventOfKind('status')).toEqual({
      kind: 'status',
      fullDiskAccess: 'denied',
      notices: notices,
    });
    expect(notices.map((notice) => notice.settingsLink)).toEqual([FULL_DISK_ACCESS_SETTINGS_LINK]);
  });

  test('gives no notice when access is granted or unknown', () => {
    expect(buildFullDiskAccessNotices('granted')).toEqual([]);
    expect(buildFullDiskAccessNotices('unknown')).toEqual([]);
  });
});
