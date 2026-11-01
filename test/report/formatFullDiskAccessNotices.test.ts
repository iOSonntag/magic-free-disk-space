import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatFullDiskAccessNotices } from '../../src/report/formatFullDiskAccessNotices.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from '../../src/report/noticeView.js';

/** The `status` event of the protocol fixture the app is tested with. */
async function loadFixtureStatusEvent(): Promise<unknown> {
  const fixtureText = await readFile(join(import.meta.dir, '../bridge/bridgeEvents.jsonl'), 'utf8');
  const events: unknown[] = fixtureText
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line));

  return events.find(
    (event) =>
      typeof event === 'object' && event !== null && 'kind' in event && event.kind === 'status',
  );
}

describe('formatFullDiskAccessNotices', () => {
  test('gives the banner of the protocol fixture, with the Settings link, while access is denied', async () => {
    const notices = formatFullDiskAccessNotices('denied');

    expect(await loadFixtureStatusEvent()).toEqual({
      kind: 'status',
      fullDiskAccess: 'denied',
      notices: notices,
    });
    expect(notices.map((notice) => notice.settingsLink)).toEqual([FULL_DISK_ACCESS_SETTINGS_LINK]);
  });

  test('gives no notice when access is granted or unknown', () => {
    expect(formatFullDiskAccessNotices('granted')).toEqual([]);
    expect(formatFullDiskAccessNotices('unknown')).toEqual([]);
  });
});
