import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'item_detail_lines.dart';
import 'reveal_in_finder_button.dart';

/// What the (i) of a row opens: where the item is, why it is offered, how
/// it goes, and Reveal in Finder for a path of the current scan.
class ItemDetailsPanel extends StatelessWidget {
  const ItemDetailsPanel({
    super.key,
    required this.item,
    required this.accent,
    required this.revealPaths,
    required this.urlOpener,
  });

  final ItemView item;
  final Color accent;
  final Set<String> revealPaths;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final String? displayPath = item.displayPath;
    final String? removalText = formatRemovalText(item.removal);
    final RevealUrl? revealUrl = RevealUrl.tryParse(
      item.revealPath,
      allowedPaths: revealPaths,
    );
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(
        left: StageSpacing.page,
        right: StageSpacing.regular,
        bottom: StageSpacing.medium,
      ),
      padding: const EdgeInsets.all(StageSpacing.regular),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.035),
        borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
      ),
      child: SelectionArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (displayPath != null) ...[
              ItemPathText(path: displayPath),
              const SizedBox(height: StageSpacing.medium),
            ],
            ItemDetailLines(lines: item.detailLines, accent: accent),
            if (item.matchedBy == LeftoverMatch.name)
              Padding(
                padding: const EdgeInsets.only(bottom: StageSpacing.small),
                child: Text(
                  "Matched by its name, not by the app's bundle id. Check that it belongs to an app you removed.",
                  style: TypeRamp.body.copyWith(color: StageColors.review),
                ),
              ),
            if (removalText != null) Text(removalText, style: TypeRamp.caption),
            if (revealUrl != null) ...[
              const SizedBox(height: StageSpacing.medium),
              RevealInFinderButton(
                url: revealUrl,
                urlOpener: urlOpener,
                accent: accent,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
