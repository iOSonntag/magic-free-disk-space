import { describe, expect, test } from 'bun:test';
import type { AdviceOpener, CatalogEntry } from '../../../src/catalog/catalog.js';
import { OWN_APP_ENTRIES } from '../../../src/platform/darwin/catalog/ownApp.js';

/** Each entry's risk, path, and the opener of its advice by its id; `null` for no advice. */
function buildRiskPathAndOpenerById(
  entries: CatalogEntry[],
): Record<string, [CatalogEntry['risk'], string, AdviceOpener | null]> {
  return Object.fromEntries(
    entries.map((entry) => [
      entry.id,
      [entry.risk, entry.path, entry.removal.kind === 'advice' ? entry.removal.opener : null],
    ]),
  );
}

describe('OWN_APP_ENTRIES', () => {
  test('pins the risk, the path, and the opener of every entry', () => {
    expect(buildRiskPathAndOpenerById(OWN_APP_ENTRIES)).toEqual({
      'iphone-backups': [
        'never',
        'Library/Application Support/MobileSync/Backup',
        { kind: 'app', app: 'finder' },
      ],
      'photos-library': [
        'never',
        'Pictures/Photos Library.photoslibrary',
        { kind: 'app', app: 'photos' },
      ],
      'messages-attachments': [
        'never',
        'Library/Messages/Attachments',
        { kind: 'app', app: 'messages' },
      ],
      'music-downloads': ['careful', 'Music/Music/Media.localized', { kind: 'app', app: 'music' }],
      'tv-downloads': ['careful', 'Movies/TV/Media.localized', { kind: 'app', app: 'tv' }],
      'imovie-library': [
        'careful',
        'Movies/iMovie Library.imovielibrary',
        { kind: 'app', app: 'iMovie' },
      ],
      'garageband-sound-library': [
        'review',
        '/Library/Application Support/GarageBand',
        { kind: 'app', app: 'garageBand' },
      ],
      'logic-sound-library': [
        'review',
        '/Library/Application Support/Logic',
        { kind: 'app', app: 'logicPro' },
      ],
      'apple-loops': ['review', '/Library/Audio/Apple Loops', { kind: 'app', app: 'garageBand' }],
    });
  });

  test("what the person's own apps keep is only advised, for those apps to remove", () => {
    expect(OWN_APP_ENTRIES.filter((entry) => entry.removal.kind !== 'advice')).toEqual([]);
  });

  test('every entry is of the category its own app handles', () => {
    expect(OWN_APP_ENTRIES.filter((entry) => entry.category !== 'appManaged')).toEqual([]);
  });
});
