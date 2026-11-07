import { describe, expect, test } from 'bun:test';
import { SYSTEM_ENTRIES } from '../../../src/platform/darwin/catalog/system.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('SYSTEM_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(SYSTEM_ENTRIES)).toEqual({
      'macos-update-downloads': ['careful', '/Library/Updates'],
    });
  });
});
