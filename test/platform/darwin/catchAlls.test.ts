import { describe, expect, test } from 'bun:test';
import { CATCH_ALL_ENTRIES } from '../../../src/platform/darwin/catalog/catchAlls.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('CATCH_ALL_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(CATCH_ALL_ENTRIES)).toEqual({
      'user-caches': ['review', 'Library/Caches'],
      'home-caches': ['review', '.cache'],
      trash: ['careful', '.Trash'],
      'user-temporary-files': ['safe', ''],
    });
  });

  test('each catch-all offers the children of its folder, the temporary files once old', () => {
    expect(
      CATCH_ALL_ENTRIES.map((entry) => [entry.id, entry.root, entry.selection, entry.ageRule]),
    ).toEqual([
      ['user-caches', 'home', { kind: 'children' }, { kind: 'none' }],
      ['home-caches', 'home', { kind: 'children' }, { kind: 'none' }],
      ['trash', 'home', { kind: 'children' }, { kind: 'none' }],
      ['user-temporary-files', 'temp', { kind: 'children' }, { kind: 'unchangedDays', days: 10 }],
    ]);
  });
});
