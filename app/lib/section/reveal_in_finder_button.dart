import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';

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
