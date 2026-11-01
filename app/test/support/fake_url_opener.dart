import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/link/url_opener.dart';

/// Records each URL it is asked to open and answers [isOpening]; it opens
/// nothing.
final class FakeUrlOpener implements UrlOpener {
  FakeUrlOpener({required this.isOpening});

  final bool isOpening;
  final List<OpenableUrl> requestedUrls = [];

  @override
  Future<bool> open(OpenableUrl url) async {
    requestedUrls.add(url);
    return isOpening;
  }
}
