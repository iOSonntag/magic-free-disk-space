import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../feedback/error_text.dart';
import '../link/link_button.dart';
import '../link/url_opener.dart';
import 'update_controller.dart';

/// The notice of a newer release in neutral colours, and below it why a
/// change of the update check was not saved; empty when there is neither.
class UpdateBanner extends StatelessWidget {
  const UpdateBanner({
    super.key,
    required this.controller,
    required this.urlOpener,
  });

  final UpdateController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final UpdateNoticeView? notice = controller.notice;
        final String? saveFailureText = controller.saveFailureText;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (notice != null)
              _UpdateNoticeBox(notice: notice, urlOpener: urlOpener),
            if (saveFailureText != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                child: ErrorText(text: saveFailureText),
              ),
          ],
        );
      },
    );
  }
}

class _UpdateNoticeBox extends StatelessWidget {
  const _UpdateNoticeBox({required this.notice, required this.urlOpener});

  final UpdateNoticeView notice;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surfaceContainerHighest,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(notice.titleText, style: theme.textTheme.titleSmall),
            const SizedBox(height: 4),
            SelectableText(notice.lines.join('\n')),
            const SizedBox(height: 8),
            LinkButton(link: notice.downloadLink, urlOpener: urlOpener),
          ],
        ),
      ),
    );
  }
}
