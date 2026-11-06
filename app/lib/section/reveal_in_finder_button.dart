import 'package:flutter/widgets.dart';

import '../bridge/openable_url.dart';
import '../design/app_icons.dart';
import '../link/url_opener.dart';
import '../shell/open_url_button.dart';

/// The reveal URL of [revealPath], or `null` when there is none or
/// [allowedPaths], the reveal paths of the current scan, does not hold it.
RevealUrl? findRevealUrl(String? revealPath, {required Set<String> allowedPaths}) {
  if (revealPath == null) {
    return null;
  }
  try {
    return RevealUrl.parse(revealPath, allowedPaths: allowedPaths);
  } on FormatException {
    return null;
  }
}

class RevealInFinderButton extends StatelessWidget {
  const RevealInFinderButton({
    super.key,
    required this.url,
    required this.urlOpener,
    required this.accent,
  });

  final RevealUrl url;
  final UrlOpener urlOpener;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return OpenUrlButton(
      labelText: 'Reveal in Finder',
      url: url,
      failedText: 'Finder did not open.',
      urlOpener: urlOpener,
      icon: AppIcons.revealInFinder,
      accent: accent,
    );
  }
}
