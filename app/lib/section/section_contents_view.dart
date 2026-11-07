import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'advice_card.dart';
import 'item_group_card.dart';

/// A section's groups that hold items, safe first, then the advice cards.
class SectionContentsView extends StatelessWidget {
  const SectionContentsView({
    super.key,
    required this.contents,
    required this.look,
    required this.selectedNumbers,
    required this.onToggle,
    required this.onToggleGroup,
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

  /// Flips a group's items as one, as [ItemGroupCard.onToggleGroup] says;
  /// `null` while the selection cannot change.
  final void Function(List<int> numbers)? onToggleGroup;
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
                key: ItemGroupCardKey(group),
                group: group,
                items: contents.getGroupItems(group),
                look: look,
                selectedNumbers: selectedNumbers,
                onToggle: onToggle,
                onToggleGroup: onToggleGroup,
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
