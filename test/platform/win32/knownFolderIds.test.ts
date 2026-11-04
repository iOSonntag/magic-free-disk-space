import { describe, expect, test } from 'bun:test';
import { buildGuidBytes, KNOWN_FOLDER_IDS } from '../../../src/platform/win32/knownFolderIds.js';

describe('buildGuidBytes', () => {
  test('lays out FOLDERID_Desktop as the GUID struct does', () => {
    expect([...buildGuidBytes({ text: KNOWN_FOLDER_IDS.desktop })]).toEqual([
      0x3a, 0xcc, 0xbf, 0xb4, 0x2c, 0xdb, 0x4c, 0x42, 0xb0, 0x29, 0x7f, 0xe9, 0x9a, 0x87, 0xc6,
      0x41,
    ]);
  });

  test('reads the hex digits in either case', () => {
    expect(buildGuidBytes({ text: 'a52bba46-e9e1-435f-b3d9-28daa648c0f6' })).toEqual(
      buildGuidBytes({ text: 'A52BBA46-E9E1-435F-B3D9-28DAA648C0F6' }),
    );
  });

  test('throws for a text that is no GUID', () => {
    for (const text of ['', '{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}', 'B4BFCC3A-DB2C-424C-B029']) {
      expect(() => buildGuidBytes({ text: text })).toThrow();
    }
  });
});

describe('KNOWN_FOLDER_IDS', () => {
  test('names a distinct GUID for each known folder', () => {
    const ids = Object.values(KNOWN_FOLDER_IDS).map((id) => id.toUpperCase());

    for (const id of ids) {
      expect(buildGuidBytes({ text: id })).toHaveLength(16);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
