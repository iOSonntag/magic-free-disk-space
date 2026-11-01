import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import 'settings_opener.dart';

/// The lines of a notice, and the button of its settings link when it has
/// one.
class NoticeBody extends StatelessWidget {
  const NoticeBody({
    super.key,
    required this.notice,
    required this.settingsOpener,
  });

  final NoticeView notice;
  final SettingsOpener settingsOpener;

  @override
  Widget build(BuildContext context) {
    final SettingsLinkView? settingsLink = notice.settingsLink;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SelectableText(notice.lines.join('\n')),
        if (settingsLink != null) ...[
          const SizedBox(height: 8),
          _SettingsLinkButton(
            link: settingsLink,
            settingsOpener: settingsOpener,
          ),
        ],
      ],
    );
  }
}

class _SettingsLinkButton extends StatefulWidget {
  const _SettingsLinkButton({required this.link, required this.settingsOpener});

  final SettingsLinkView link;
  final SettingsOpener settingsOpener;

  @override
  State<_SettingsLinkButton> createState() => _SettingsLinkButtonState();
}

class _SettingsLinkButtonState extends State<_SettingsLinkButton> {
  bool _isOpenFailed = false;

  Future<void> _openLink() async {
    final bool opened = await widget.settingsOpener.open(widget.link.url);
    if (!mounted) {
      return;
    }
    setState(() {
      _isOpenFailed = !opened;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        OutlinedButton(
          onPressed: _openLink,
          child: Text(widget.link.labelText),
        ),
        if (_isOpenFailed) ...[
          const SizedBox(height: 4),
          SelectableText(
            widget.link.failedText,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ],
      ],
    );
  }
}
