import { describe, expect, test } from 'bun:test';
import { parseBridgeRequest } from '../../src/bridge/parseBridgeRequest.js';

describe('parseBridgeRequest', () => {
  test('parses the three requests', () => {
    expect(parseBridgeRequest({ line: '{"kind":"scan"}' })).toEqual({
      kind: 'succeeded',
      value: { kind: 'scan' },
    });
    expect(parseBridgeRequest({ line: '{"kind":"plan","numbers":[1,3]}' })).toEqual({
      kind: 'succeeded',
      value: { kind: 'plan', numbers: [1, 3] },
    });
    expect(
      parseBridgeRequest({ line: '{"kind":"delete","planId":2,"confirmation":"DELETE"}' }),
    ).toEqual({
      kind: 'succeeded',
      value: { kind: 'delete', planId: 2, confirmation: 'DELETE' },
    });
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
      '{"kind":"remove"}',
      '{"kind":"plan"}',
      '{"kind":"plan","numbers":"1-3"}',
      '{"kind":"plan","numbers":[1.5]}',
      '{"kind":"plan","numbers":["1"]}',
      '{"kind":"delete","planId":1}',
      '{"kind":"delete","planId":"1","confirmation":"DELETE"}',
      '{"kind":"delete","planId":1,"confirmation":true}',
    ];

    for (const line of lines) {
      expect(parseBridgeRequest({ line: line })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownRequest' },
      });
    }
  });
});
