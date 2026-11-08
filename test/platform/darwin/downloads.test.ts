import { describe, expect, test } from 'bun:test';
import { DOWNLOAD_ENTRIES } from '../../../src/platform/darwin/catalog/downloads.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('DOWNLOAD_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(DOWNLOAD_ENTRIES)).toEqual({
      'downloads-installers': ['careful', 'Downloads'],
      'iphone-software-updates': ['review', 'Library/iTunes/iPhone Software Updates'],
      'ipad-software-updates': ['review', 'Library/iTunes/iPad Software Updates'],
    });
  });
});
