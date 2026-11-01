import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../feedback/error_text.dart';
import 'url_opener.dart';

/// A button that opens the URL of [link], with the link's failed text below
/// it when the URL did not open.
class LinkButton extends StatefulWidget {
  const LinkButton({super.key, required this.link, required this.urlOpener});

  final LinkView link;
  final UrlOpener urlOpener;

  @override
  State<LinkButton> createState() => _LinkButtonState();
}

class _LinkButtonState extends State<LinkButton> {
  bool _isOpenFailed = false;

  Future<void> _openLink() async {
    final bool opened = await widget.urlOpener.open(widget.link.url);
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
          ErrorText(text: widget.link.failedText),
        ],
      ],
    );
  }
}
