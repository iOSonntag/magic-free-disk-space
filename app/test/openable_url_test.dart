import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';

const String revealPath = '/Users/me/Library/Caches/ToolCache';
const String logPath =
    '/Users/me/Library/Logs/magic-free-disk-space/deletions.jsonl';

void main() {
  group('RevealUrl', () {
    test('parses a path of the scan or the log of the run', () {
      for (final String path in [revealPath, logPath]) {
        expect(
          RevealUrl.parse(path, allowedPaths: {revealPath, logPath}).text,
          path,
        );
      }
    });

    test('throws on a path neither of the scan nor of the run', () {
      expect(
        () => RevealUrl.parse(
          '/Users/me/Documents',
          allowedPaths: {revealPath, logPath},
        ),
        throwsFormatException,
      );
      expect(
        () => RevealUrl.parse(revealPath, allowedPaths: {}),
        throwsFormatException,
      );
    });

    test('throws on a relative path, even an allowed one', () {
      expect(
        () => RevealUrl.parse('-a', allowedPaths: {'-a'}),
        throwsFormatException,
      );
      expect(
        () => RevealUrl.parse(
          'Library/Caches',
          allowedPaths: {'Library/Caches'},
        ),
        throwsFormatException,
      );
    });
  });

  test('OpenAppUrl names each app by its bundle id', () {
    expect(
      {
        for (final OpenableApp app in OpenableApp.values)
          app: OpenAppUrl.forApp(app)?.text,
      },
      {
        OpenableApp.photos: 'com.apple.Photos',
        OpenableApp.messages: 'com.apple.MobileSMS',
        OpenableApp.music: 'com.apple.Music',
        OpenableApp.tv: 'com.apple.TV',
        OpenableApp.podcasts: 'com.apple.podcasts',
        OpenableApp.garageBand: 'com.apple.garageband10',
        OpenableApp.logicPro: 'com.apple.logic10',
        OpenableApp.iMovie: 'com.apple.iMovieApp',
        OpenableApp.finalCutPro: 'com.apple.FinalCut',
        OpenableApp.finder: 'com.apple.finder',
        OpenableApp.unknown: null,
      },
    );
  });

  group('SettingsPaneUrl', () {
    test('names each pane by its extension of System Settings', () {
      expect(
        {
          for (final SettingsPane pane in SettingsPane.values)
            pane: SettingsPaneUrl.forPane(pane)?.text,
        },
        {
          SettingsPane.storage:
              'x-apple.systempreferences:com.apple.settings.Storage',
          SettingsPane.icloud:
              'x-apple.systempreferences:'
              'com.apple.systempreferences.AppleIDSettings',
          SettingsPane.timeMachine:
              'x-apple.systempreferences:'
              'com.apple.Time-Machine-Settings.extension',
          SettingsPane.unknown: null,
        },
      );
    });

    test('opens only URLs of the scheme of System Settings', () {
      for (final SettingsPane pane in SettingsPane.values) {
        final SettingsPaneUrl? url = SettingsPaneUrl.forPane(pane);
        if (url != null) {
          expect(SystemSettingsUrl.parse(url.text).text, url.text);
        }
      }
    });
  });
}
