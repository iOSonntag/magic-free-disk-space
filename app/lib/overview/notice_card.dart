import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../design/glass_card.dart';
import '../design/glyph_tile.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../shell/open_url_button.dart';

/// A notice as a glass card: its glyph, title and lines, and the button of
/// its link when it has one.
class NoticeCard extends StatelessWidget {
  const NoticeCard({
    super.key,
    required this.glyph,
    required this.accent,
    required this.titleText,
    required this.lines,
    required this.link,
    required this.urlOpener,
  });

  final IconData glyph;
  final Color accent;
  final String titleText;
  final List<String> lines;
  final LinkView? link;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final LinkView? link = this.link;
    return GlassCard(
      accent: accent,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GlyphTile(glyph: glyph, accent: accent, size: 40),
          const SizedBox(width: StageSpacing.regular),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titleText, style: TypeRamp.title),
                if (lines.isNotEmpty) ...[
                  const SizedBox(height: StageSpacing.tight),
                  Text(lines.join('\n'), style: TypeRamp.body),
                ],
                if (link != null) ...[
                  const SizedBox(height: StageSpacing.medium),
                  OpenUrlButton.forLink(
                    link: link,
                    urlOpener: urlOpener,
                    accent: accent,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
