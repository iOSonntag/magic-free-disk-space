import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/link_process/process_url_opener.dart';

const String revealPath = '/Users/me/Library/Caches/ToolCache';
const String fullDiskAccessSettingsUrl =
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
const String releasePageUrl =
    'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0';

void main() {
  group('buildOpenArguments', () {
    test('shows a path in Finder with -R', () {
      expect(
        buildOpenArguments(
          RevealUrl.parse(revealPath, allowedPaths: {revealPath}),
        ),
        ['-R', revealPath],
      );
    });

    test('opens an app by its bundle id with -b', () {
      expect(buildOpenArguments(OpenAppUrl.forApp(OpenableApp.photos)!), [
        '-b',
        'com.apple.Photos',
      ]);
    });

    test('opens a pane of System Settings by its URL alone', () {
      expect(
        buildOpenArguments(SettingsPaneUrl.forPane(SettingsPane.storage)!),
        ['x-apple.systempreferences:com.apple.settings.Storage'],
      );
      expect(
        buildOpenArguments(SystemSettingsUrl.parse(fullDiskAccessSettingsUrl)),
        [fullDiskAccessSettingsUrl],
      );
    });

    test('opens a release page by its URL alone', () {
      expect(buildOpenArguments(ReleasePageUrl.parse(releasePageUrl)), [
        releasePageUrl,
      ]);
    });
  });
}
