import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import 'url_opener.dart';

/// A [StageButton] that opens [url] through [urlOpener], and shows
/// [failedText] below it once an open did not succeed.
class OpenUrlButton extends StatefulWidget {
  const OpenUrlButton({
    super.key,
    required this.labelText,
    required this.url,
    required this.failedText,
    required this.urlOpener,
    required IconData this.icon,
    required this.accent,
  });

  /// The button of [link], with its label alone.
  OpenUrlButton.forLink({
    super.key,
    required LinkView link,
    required this.urlOpener,
    required this.accent,
  }) : labelText = link.labelText,
       url = link.url,
       failedText = link.failedText,
       icon = null;

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
