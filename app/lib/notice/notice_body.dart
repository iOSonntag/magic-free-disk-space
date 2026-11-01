import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../link/link_button.dart';
import '../link/url_opener.dart';

/// The lines of a notice, and the button of its link when it has one.
class NoticeBody extends StatelessWidget {
  const NoticeBody({
    super.key,
    required this.lines,
    required this.link,
    required this.urlOpener,
  });

  final List<String> lines;
  final LinkView? link;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final LinkView? link = this.link;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectableText(lines.join('\n')),
        if (link != null) ...[
          const SizedBox(height: 8),
          LinkButton(link: link, urlOpener: urlOpener),
        ],
      ],
    );
  }
}
