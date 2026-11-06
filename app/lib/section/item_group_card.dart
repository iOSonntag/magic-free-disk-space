import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../design/app_icons.dart';
import '../design/format_bytes.dart';
import '../design/glass_card.dart';
import '../design/section_look.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../removal/item_count_words.dart';
import '../shell/stage_check_mark.dart';
import 'item_row.dart';
import 'item_words.dart';
import 'section_contents.dart';

/// Whether a group's select toggle shows all, none, or some (`null`) of
/// [numbers] ticked in [selectedNumbers].
bool? findGroupSelectValue(List<int> numbers, Set<int> selectedNumbers) {
  final int selectedCount = numbers.where(selectedNumbers.contains).length;
  if (selectedCount == 0) {
    return false;
  }
  if (selectedCount == numbers.length) {
    return true;
  }
  return null;
}

/// The numbers a tap on a group's select toggle flips: the unticked ones
/// while any is unticked, else all of them.
List<int> listGroupToggleNumbers(List<int> numbers, Set<int> selectedNumbers) {
  final List<int> unticked = [
    for (final int number in numbers)
      if (!selectedNumbers.contains(number)) number,
  ];
  if (unticked.isNotEmpty) {
    return unticked;
  }
  return numbers;
}

/// One group of a section, safe, review or careful, as one glass card: its
/// select toggle and title above its rows, which it shows or hides.
class ItemGroupCard extends StatefulWidget {
  const ItemGroupCard({
    super.key,
    required this.group,
    required this.items,
    required this.look,
    required this.selectedNumbers,
    required this.onToggle,
    required this.revealPaths,
    required this.urlOpener,
    required this.now,
  });

  final ShownItemGroup group;
  final List<ItemView> items;
  final SectionLook look;
  final Set<int> selectedNumbers;

  /// Flips the item numbered by its argument; `null` while the selection
  /// cannot change.
  final void Function(int number)? onToggle;
  final Set<String> revealPaths;
  final UrlOpener urlOpener;
  final DateTime now;

  @override
  State<ItemGroupCard> createState() => _ItemGroupCardState();
}

class _ItemGroupCardState extends State<ItemGroupCard> {
  late bool _isExpanded = widget.group == ShownItemGroup.safe;

  void _toggleExpanded() {
    setState(() {
      _isExpanded = !_isExpanded;
    });
  }

  VoidCallback? _buildGroupToggle(List<int> numbers) {
    final void Function(int number)? onToggle = widget.onToggle;
    if (onToggle == null) {
      return null;
    }
    return () {
      for (final int number in listGroupToggleNumbers(
        numbers,
        widget.selectedNumbers,
      )) {
        onToggle(number);
      }
    };
  }

  VoidCallback? _buildItemToggle(int number) {
    final void Function(int number)? onToggle = widget.onToggle;
    if (onToggle == null) {
      return null;
    }
    return () => onToggle(number);
  }

  @override
  Widget build(BuildContext context) {
    final String title = formatGroupTitle(widget.group);
    final Color tone = getGroupTone(widget.group);
    final List<int> numbers = [
      for (final ItemView item in widget.items) item.number,
    ];
    final ({int allocatedBytes, bool isComplete}) size = sumItemSizes(widget.items);
    final String sizeText = formatSizeText(
      allocatedBytes: size.allocatedBytes,
      isComplete: size.isComplete,
    );
    final String countText = formatItemCount(numbers.length);
    return GlassCard(
      accent: widget.look.accent,
      padding: const EdgeInsets.all(StageSpacing.medium),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StageCheckbox(
                value: findGroupSelectValue(numbers, widget.selectedNumbers),
                accent: widget.look.accent,
                semanticsLabel: 'Select all of $title',
                onPressed: _buildGroupToggle(numbers),
              ),
              const SizedBox(width: StageSpacing.tight),
              Expanded(
                child: Semantics(
                  container: true,
                  button: true,
                  expanded: _isExpanded,
                  label: _isExpanded ? 'Hide $title' : 'Show $title',
                  child: Material(
                    type: MaterialType.transparency,
                    child: InkWell(
                      onTap: _toggleExpanded,
                      borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
                      hoverColor: tone.withValues(alpha: 0.05),
                      child: ExcludeSemantics(
                        child: Padding(
                          padding: const EdgeInsets.all(StageSpacing.small),
                          child: Row(
                            children: [
                              Icon(getGroupGlyph(widget.group), size: 22, color: tone),
                              const SizedBox(width: StageSpacing.medium),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(title, style: TypeRamp.title),
                                    const SizedBox(height: 2),
                                    Text(
                                      formatGroupHint(widget.group),
                                      style: TypeRamp.caption,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: StageSpacing.regular),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(sizeText, style: TypeRamp.figure),
                                  Text(countText, style: TypeRamp.caption),
                                ],
                              ),
                              const SizedBox(width: StageSpacing.small),
                              Icon(
                                _isExpanded ? AppIcons.collapse : AppIcons.expand,
                                size: 22,
                                color: StageColors.textSecondary,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (_isExpanded) ...[
            const SizedBox(height: StageSpacing.small),
            for (final (int index, ItemView item) in widget.items.indexed) ...[
              if (index > 0)
                const Divider(
                  height: 1,
                  thickness: 1,
                  indent: StageSpacing.page,
                  color: GlassTokens.rimShade,
                ),
              ItemRow(
                key: ItemRowKey(item.number),
                item: item,
                look: widget.look,
                isSelected: widget.selectedNumbers.contains(item.number),
                onToggle: _buildItemToggle(item.number),
                revealPaths: widget.revealPaths,
                urlOpener: widget.urlOpener,
                now: widget.now,
              ),
            ],
          ],
        ],
      ),
    );
  }
}
