import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'item_row.dart';

/// Whether a group's select toggle shows all, none, or some (`null`) of
/// [numbers] ticked in [selectedNumbers].
bool? getGroupSelectValue(List<int> numbers, Set<int> selectedNumbers) {
  final int selectedCount = numbers.where(selectedNumbers.contains).length;
  if (selectedCount == 0) {
    return false;
  }
  if (selectedCount == numbers.length) {
    return true;
  }
  return null;
}

/// The key of the card of the group [value] of a section's page.
final class ItemGroupCardKey extends ValueKey<ShownItemGroup> {
  const ItemGroupCardKey(super.value);
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
    required this.onToggleGroup,
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

  /// Ticks every item numbered by its argument while any is unticked, else
  /// unticks them all; `null` while the selection cannot change.
  final void Function(List<int> numbers)? onToggleGroup;
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

  /// `null` too when no item of the group can be ticked.
  VoidCallback? _buildGroupToggle(List<int> numbers) {
    final void Function(List<int> numbers)? onToggleGroup = widget.onToggleGroup;
    if (onToggleGroup == null || numbers.isEmpty) {
      return null;
    }
    return () => onToggleGroup(numbers);
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
    // The toggle leaves out a never item, whose row offers no tick.
    final List<int> numbers = [
      for (final ItemView item in widget.items)
        if (isItemRemovable(item)) item.number,
    ];
    final String sizeText = formatItemSizeSumText(sumItemSizes(widget.items));
    final String countText = formatItemCount(widget.items.length);
    return GlassCard(
      accent: widget.look.accent,
      padding: const EdgeInsets.all(StageSpacing.medium),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              StageCheckbox(
                value: getGroupSelectValue(numbers, widget.selectedNumbers),
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
