import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../link/link_button.dart';
import '../link/url_opener.dart';

/// The lines of a notice, and the button of its settings link when it has
/// one.
class NoticeBody extends StatelessWidget {
  const NoticeBody({super.key, required this.notice, required this.urlOpener});

  final NoticeView notice;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final LinkView? settingsLink = notice.settingsLink;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectableText(notice.lines.join('\n')),
        if (settingsLink != null) ...[
          const SizedBox(height: 8),
          LinkButton(link: settingsLink, urlOpener: urlOpener),
        ],
      ],
    );
  }
}
