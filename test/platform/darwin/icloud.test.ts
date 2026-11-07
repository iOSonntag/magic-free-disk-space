import { describe, expect, test } from 'bun:test';
import { ICLOUD_ENTRIES } from '../../../src/platform/darwin/catalog/icloud.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('ICLOUD_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(ICLOUD_ENTRIES)).toEqual({
      'icloud-drive-downloads': ['review', 'Library/Mobile Documents'],
    });
  });
});
