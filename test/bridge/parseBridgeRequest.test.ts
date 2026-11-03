import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseBridgeRequest } from '../../src/bridge/parseBridgeRequest.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';

describe.skipIf(AWAITS_WIN32_PLATFORM)('parseBridgeRequest', () => {
  // The app's test builds its requests against the same fixture.
  test('parses the six requests of the protocol fixture', async () => {
    const fixtureText = await readFile(join(import.meta.dir, 'bridgeRequests.jsonl'), 'utf8');
    const lines = fixtureText.split('\n').filter((line) => line !== '');

    expect(lines.map((line) => parseBridgeRequest({ line: line }))).toEqual([
      { kind: 'succeeded', value: { kind: 'scan' } },
      { kind: 'succeeded', value: { kind: 'plan', numbers: [1, 3] } },
      { kind: 'succeeded', value: { kind: 'delete', planId: 2, confirmation: 'DELETE' } },
      { kind: 'succeeded', value: { kind: 'status' } },
      { kind: 'succeeded', value: { kind: 'checkUpdate' } },
      { kind: 'succeeded', value: { kind: 'setUpdateCheck', isEnabled: false } },
    ]);
  });

  test('fails on a line that is no JSON', () => {
    for (const line of ['', 'scan', '{"kind":']) {
      expect(parseBridgeRequest({ line: line })).toEqual({
        kind: 'failed',
        failure: { reason: 'invalidJson' },
      });
    }
  });

  test('fails on any other shape', () => {
    const lines = [
      'null',
      '[]',
      '"scan"',
      '"status"',
      '{"kind":"remove"}',
      '{"kind":"Status"}',
      '{"kind":"plan"}',
      '{"kind":"plan","numbers":"1-3"}',
      '{"kind":"plan","numbers":[1.5]}',
      '{"kind":"plan","numbers":["1"]}',
      '{"kind":"delete","planId":1}',
      '{"kind":"delete","planId":"1","confirmation":"DELETE"}',
      '{"kind":"delete","planId":1,"confirmation":true}',
      '{"kind":"CheckUpdate"}',
      '{"kind":"setUpdateCheck"}',
      '{"kind":"setUpdateCheck","isEnabled":"false"}',
      '{"kind":"setUpdateCheck","isEnabled":0}',
      '{"kind":"setUpdateCheck","isEnabled":null}',
      '{"kind":"setUpdateCheck","enabled":true}',
    ];

    for (const line of lines) {
      expect(parseBridgeRequest({ line: line })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownRequest' },
      });
    }
  });
});
