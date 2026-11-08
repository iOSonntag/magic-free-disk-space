import { describe, expect, test } from 'bun:test';
import { APP_CACHE_ENTRIES } from '../../../src/platform/darwin/catalog/appCaches.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('APP_CACHE_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(APP_CACHE_ENTRIES)).toEqual({
      'spotify-cache': ['review', 'Library/Caches/com.spotify.client'],
      'spotify-offline-music': ['careful', 'Library/Application Support/Spotify/PersistentCache'],
      'slack-cache': ['safe', 'Library/Application Support/Slack/Cache'],
      'slack-code-cache': ['safe', 'Library/Application Support/Slack/Code Cache'],
      'slack-service-worker': ['review', 'Library/Application Support/Slack/Service Worker'],
      'discord-cache': ['safe', 'Library/Application Support/discord/Cache'],
      'discord-code-cache': ['safe', 'Library/Application Support/discord/Code Cache'],
      'discord-gpu-cache': ['safe', 'Library/Application Support/discord/GPUCache'],
      'discord-dawn-cache': ['safe', 'Library/Application Support/discord/DawnCache'],
      'discord-crash-reports': ['safe', 'Library/Application Support/discord/Crashpad'],
      'teams-cache': ['review', 'Library/Containers/com.microsoft.teams2/Data/Library/Caches'],
      'teams-classic-cache': ['review', 'Library/Application Support/Microsoft/Teams/Cache'],
      'teams-classic-code-cache': [
        'review',
        'Library/Application Support/Microsoft/Teams/Code Cache',
      ],
      'teams-classic-gpu-cache': ['review', 'Library/Application Support/Microsoft/Teams/GPUCache'],
      'mail-downloads': ['review', 'Library/Containers/com.apple.mail/Data/Library/Mail Downloads'],
      'adobe-media-cache-files': [
        'review',
        'Library/Application Support/Adobe/Common/Media Cache Files',
      ],
      'zoom-cache': ['safe', 'Library/Caches/us.zoom.xos'],
      'steam-download-cache': ['careful', 'Library/Application Support/Steam/appcache'],
      'steam-web-cache': ['review', 'Library/Application Support/Steam/htmlcache'],
      'steam-depot-cache': ['review', 'Library/Application Support/Steam/depotcache'],
      'steam-shader-cache': ['review', 'Library/Application Support/Steam/steamapps/shadercache'],
      'steam-logs': ['review', 'Library/Application Support/Steam/logs'],
    });
  });

  test("Adobe's shared media cache is held back while any app of its video family runs", () => {
    expect(
      APP_CACHE_ENTRIES.find((entry) => entry.id === 'adobe-media-cache-files')?.owner?.app,
    ).toEqual({
      kind: 'bundleIdFamily',
      bundleIdPrefixes: [
        'com.adobe.PremierePro',
        'com.adobe.AfterEffects',
        'com.adobe.ame',
        'com.adobe.Audition',
        'com.adobe.CharacterAnimator',
        'com.adobe.Character-Animator',
        'com.adobe.Prelude',
      ],
    });
  });

  test("Spotify's offline music and Steam's downloads are only advised, never deleted", () => {
    const advisedIds = APP_CACHE_ENTRIES.filter((entry) => entry.removal.kind === 'advice').map(
      (entry) => entry.id,
    );

    expect(advisedIds).toEqual(['spotify-offline-music', 'steam-download-cache']);
  });
});
