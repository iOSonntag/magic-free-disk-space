import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../design/section_look.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import 'advice_card.dart';
import 'item_group_card.dart';
import 'section_contents.dart';

/// A section's groups that hold items, safe first, then the advice cards.
class SectionContentsView extends StatelessWidget {
  const SectionContentsView({
    super.key,
    required this.contents,
    required this.look,
    required this.selectedNumbers,
    required this.onToggle,
    required this.revealPaths,
    required this.urlOpener,
    required this.adviceTitle,
  });

  final SectionContents contents;
  final SectionLook look;
  final Set<int> selectedNumbers;

  /// Flips the item numbered by its argument; `null` while the selection
  /// cannot change.
  final void Function(int number)? onToggle;
  final Set<String> revealPaths;
  final UrlOpener urlOpener;

  /// The overline above the advice cards.
  final String adviceTitle;

  @override
  Widget build(BuildContext context) {
    final DateTime now = DateTime.now();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final ShownItemGroup group in ShownItemGroup.values)
          if (contents.getGroupItems(group).isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: StageSpacing.regular),
              child: ItemGroupCard(
                key: ValueKey<ShownItemGroup>(group),
                group: group,
                items: contents.getGroupItems(group),
                look: look,
                selectedNumbers: selectedNumbers,
                onToggle: onToggle,
                revealPaths: revealPaths,
                urlOpener: urlOpener,
                now: now,
              ),
            ),
        if (contents.adviceItems.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(
              top: StageSpacing.regular,
              bottom: StageSpacing.medium,
            ),
            child: Text(adviceTitle.toUpperCase(), style: TypeRamp.overline),
          ),
          for (final AdviceItemView item in contents.adviceItems)
            Padding(
              padding: const EdgeInsets.only(bottom: StageSpacing.regular),
              child: AdviceCard(
                key: AdviceCardKey(item.key),
                item: item,
                accent: look.accent,
                sectionGlyph: look.glyph,
                revealPaths: revealPaths,
                urlOpener: urlOpener,
              ),
            ),
        ],
      ],
    );
  }
}
