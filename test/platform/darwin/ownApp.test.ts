import { describe, expect, test } from 'bun:test';
import { OWN_APP_ENTRIES } from '../../../src/platform/darwin/catalog/ownApp.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('OWN_APP_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(OWN_APP_ENTRIES)).toEqual({
      'iphone-backups': ['never', 'Library/Application Support/MobileSync/Backup'],
      'photos-library': ['never', 'Pictures/Photos Library.photoslibrary'],
      'messages-attachments': ['never', 'Library/Messages/Attachments'],
      'music-downloads': ['careful', 'Music/Music/Media.localized'],
      'tv-downloads': ['careful', 'Movies/TV/Media.localized'],
      'imovie-library': ['careful', 'Movies/iMovie Library.imovielibrary'],
      'garageband-sound-library': ['review', '/Library/Application Support/GarageBand'],
      'logic-sound-library': ['review', '/Library/Application Support/Logic'],
      'apple-loops': ['review', '/Library/Audio/Apple Loops'],
    });
  });

  test("what the person's own apps keep is only advised, for those apps to remove", () => {
    expect(OWN_APP_ENTRIES.filter((entry) => entry.removal.kind !== 'advice')).toEqual([]);
  });
});
