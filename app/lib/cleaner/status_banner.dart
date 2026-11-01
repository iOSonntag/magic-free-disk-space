import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../link/url_opener.dart';
import '../notice/notice_body.dart';

/// The notices of the bridge's status, shown open at the top of the page.
class StatusBanner extends StatelessWidget {
  const StatusBanner({
    super.key,
    required this.notices,
    required this.urlOpener,
  });

  final List<NoticeView> notices;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final (int index, NoticeView notice) in notices.indexed) ...[
              if (index > 0) const SizedBox(height: 16),
              Text(notice.titleText, style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              NoticeBody(
                lines: notice.lines,
                link: notice.settingsLink,
                urlOpener: urlOpener,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
