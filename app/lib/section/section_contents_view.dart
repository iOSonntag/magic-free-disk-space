import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'advice_card.dart';
import 'item_group_card.dart';

/// What a page lists of the section [sectionKey] once a scan is listed: its
/// contents, ticked into the controller's selection while it may change,
/// or [emptyText] when the scan holds nothing of it.
class ListedSectionContents extends StatelessWidget {
  const ListedSectionContents({
    super.key,
    required this.state,
    required this.sectionKey,
    required this.controller,
    required this.urlOpener,
    required this.emptyText,
    required this.adviceTitle,
  });

  final ListedState state;
  final SectionKey sectionKey;
  final CleanerController controller;
  final UrlOpener urlOpener;
  final String emptyText;

  /// The overline above the advice cards.
  final String adviceTitle;

  @override
  Widget build(BuildContext context) {
    final SectionContents contents = buildSectionContents(state.scan, sectionKey);
    if (contents.isEmpty) {
      return Text(emptyText, style: TypeRamp.body);
    }
    return SectionContentsView(
      contents: contents,
      look: sectionKeyToLook(sectionKey),
      selectedNumbers: state.selectedNumbers,
      onToggle: state is ScannedState ? controller.toggleCandidate : null,
      onToggleGroup: state is ScannedState ? controller.toggleCandidateGroup : null,
      revealPaths: state.scan.revealPaths,
      urlOpener: urlOpener,
      adviceTitle: adviceTitle,
    );
  }
}

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
                look: look,
                revealPaths: revealPaths,
                urlOpener: urlOpener,
                now: now,
              ),
            ),
        ],
      ],
    );
  }
}
