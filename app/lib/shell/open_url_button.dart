import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../bridge/openable_url.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import 'stage_button.dart';

/// A [StageButton] that opens [url] through [urlOpener], and shows
/// [failedText] below it once an open did not succeed.
class OpenUrlButton extends StatefulWidget {
  const OpenUrlButton({
    super.key,
    required this.labelText,
    required this.url,
    required this.failedText,
    required this.urlOpener,
    this.icon,
    this.accent = StageColors.overviewAccent,
  });

  OpenUrlButton.forLink({
    super.key,
    required LinkView link,
    required this.urlOpener,
    this.icon,
    this.accent = StageColors.overviewAccent,
  }) : labelText = link.labelText,
       url = link.url,
       failedText = link.failedText;

  final String labelText;
  final OpenableUrl url;
  final String failedText;
  final UrlOpener urlOpener;
  final IconData? icon;
  final Color accent;

  @override
  State<OpenUrlButton> createState() => _OpenUrlButtonState();
}

class _OpenUrlButtonState extends State<OpenUrlButton> {
  bool _isOpenFailed = false;

  Future<void> _openUrl() async {
    final bool opened = await widget.urlOpener.open(widget.url);
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
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        StageButton(
          label: widget.labelText,
          icon: widget.icon,
          accent: widget.accent,
          onPressed: _openUrl,
        ),
        if (_isOpenFailed) ...[
          const SizedBox(height: StageSpacing.tight + 2),
          Text(
            widget.failedText,
            style: TypeRamp.caption.copyWith(color: StageColors.careful),
          ),
        ],
      ],
    );
  }
}
