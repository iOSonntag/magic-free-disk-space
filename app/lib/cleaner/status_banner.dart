import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import 'notice_body.dart';
import 'settings_opener.dart';

/// The notices of the bridge's status, shown open at the top of the page.
class StatusBanner extends StatelessWidget {
  const StatusBanner({
    super.key,
    required this.notices,
    required this.settingsOpener,
  });

  final List<NoticeView> notices;
  final SettingsOpener settingsOpener;

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
              NoticeBody(notice: notice, settingsOpener: settingsOpener),
            ],
          ],
        ),
      ),
    );
  }
}
