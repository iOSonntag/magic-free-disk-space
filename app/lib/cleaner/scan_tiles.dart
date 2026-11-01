import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../link/url_opener.dart';
import '../notice/notice_body.dart';
import 'item_tile.dart';

const EdgeInsetsGeometry _nestedChildrenPadding = EdgeInsetsDirectional.only(
  start: 16,
);
const EdgeInsetsGeometry _textChildrenPadding = EdgeInsets.fromLTRB(
  16,
  0,
  16,
  12,
);

/// A section of the scan: its safe items open, the others collapsed in its
/// check group.
class SectionTile extends StatelessWidget {
  const SectionTile({
    super.key,
    required this.section,
    required this.selectedNumbers,
    required this.onToggle,
  });

  final SectionView section;
  final Set<int> selectedNumbers;
  final void Function(int number) onToggle;

  @override
  Widget build(BuildContext context) {
    final CheckGroupView? checkGroup = section.checkGroup;
    return _StoredExpansionTile(
      initiallyExpanded: section.isInitiallyExpanded,
      title: Row(
        children: [
          Expanded(
            child: Text(
              section.titleText,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
          const SizedBox(width: 12),
          Text(section.sizeText),
        ],
      ),
      children: [
        _ItemList(
          items: section.items,
          selectedNumbers: selectedNumbers,
          onToggle: onToggle,
        ),
        if (checkGroup != null)
          _StoredExpansionTile(
            key: const PageStorageKey<String>('checkGroup'),
            title: Text(checkGroup.titleText),
            childrenPadding: _nestedChildrenPadding,
            children: [
              _ItemList(
                items: checkGroup.items,
                selectedNumbers: selectedNumbers,
                onToggle: onToggle,
              ),
            ],
          ),
      ],
    );
  }
}

/// The items the tool does not pick for anyone, with the advice nested
/// below them.
class ExploreTile extends StatelessWidget {
  const ExploreTile({
    super.key,
    required this.explore,
    required this.selectedNumbers,
    required this.onToggle,
  });

  final ExploreView explore;
  final Set<int> selectedNumbers;
  final void Function(int number) onToggle;

  @override
  Widget build(BuildContext context) {
    final AdviceGroupView? adviceGroup = explore.adviceGroup;
    return _StoredExpansionTile(
      title: Text(
        explore.titleText,
        style: Theme.of(context).textTheme.titleMedium,
      ),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(explore.introText),
        ),
        _ItemList(
          items: explore.items,
          selectedNumbers: selectedNumbers,
          onToggle: onToggle,
        ),
        if (adviceGroup != null)
          _StoredExpansionTile(
            key: const PageStorageKey<String>('adviceGroup'),
            title: Text(adviceGroup.titleText),
            childrenPadding: _nestedChildrenPadding,
            children: [
              for (final AdviceItemView item in adviceGroup.items)
                AdviceTile(item: item),
            ],
          ),
      ],
    );
  }
}

class SkippedTile extends StatelessWidget {
  const SkippedTile({super.key, required this.skipped});

  final SkippedView skipped;

  @override
  Widget build(BuildContext context) {
    return _StoredExpansionTile(
      title: Text(skipped.titleText),
      childrenPadding: _textChildrenPadding,
      children: [SelectableText(skipped.lines.join('\n'))],
    );
  }
}

/// A notice of the scan, collapsed under its title.
class NoticeTile extends StatelessWidget {
  const NoticeTile({super.key, required this.notice, required this.urlOpener});

  final NoticeView notice;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return _StoredExpansionTile(
      title: Text(notice.titleText),
      childrenPadding: _textChildrenPadding,
      children: [
        NoticeBody(
          lines: notice.lines,
          link: notice.settingsLink,
          urlOpener: urlOpener,
        ),
      ],
    );
  }
}

/// An [ExpansionTile] that keeps its open state in the page storage under the
/// [PageStorageKey]s above it, and its children's storage, such as the scroll
/// offset of a [SelectableText], under a key of their own, so the two never
/// read each other's value.
class _StoredExpansionTile extends StatelessWidget {
  const _StoredExpansionTile({
    super.key,
    required this.title,
    required this.children,
    this.initiallyExpanded = false,
    this.childrenPadding,
  });

  final Widget title;
  final List<Widget> children;
  final bool initiallyExpanded;
  final EdgeInsetsGeometry? childrenPadding;

  @override
  Widget build(BuildContext context) {
    return ExpansionTile(
      initiallyExpanded: initiallyExpanded,
      childrenPadding: childrenPadding,
      expandedCrossAxisAlignment: CrossAxisAlignment.start,
      title: title,
      children: [
        KeyedSubtree(
          key: const PageStorageKey<String>('children'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: children,
          ),
        ),
      ],
    );
  }
}

class _ItemList extends StatelessWidget {
  const _ItemList({
    required this.items,
    required this.selectedNumbers,
    required this.onToggle,
  });

  final List<ItemView> items;
  final Set<int> selectedNumbers;
  final void Function(int number) onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final ItemView item in items)
          ItemTile(
            item: item,
            isSelected: selectedNumbers.contains(item.number),
            onToggle: () => onToggle(item.number),
          ),
      ],
    );
  }
}
