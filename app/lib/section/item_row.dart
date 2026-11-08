import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'item_details_panel.dart';

/// The key of the row of the item numbered [value].
final class ItemRowKey extends ValueKey<int> {
  const ItemRowKey(super.value);
}

/// A selectable item: a tap on the row ticks it, and its (i) opens its
/// details below it. The row is never a glass card of its own; its group's
/// card blurs once for all its rows.
class ItemRow extends StatefulWidget {
  const ItemRow({
    super.key,
    required this.item,
    required this.look,
    required this.isSelected,
    required this.onToggle,
    required this.revealPaths,
    required this.urlOpener,
    required this.now,
  });

  final ItemView item;
  final SectionLook look;
  final bool isSelected;

  /// `null` while the selection cannot change.
  final VoidCallback? onToggle;
  final Set<String> revealPaths;
  final UrlOpener urlOpener;
  final DateTime now;

  @override
  State<ItemRow> createState() => _ItemRowState();
}

class _ItemRowState extends State<ItemRow> {
  bool _isDetailsOpen = false;

  void _toggleDetails() {
    setState(() {
      _isDetailsOpen = !_isDetailsOpen;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ItemView item = widget.item;
    final String sizeText = formatSizeText(
      allocatedBytes: item.allocatedBytes,
      isComplete: item.isComplete,
    );
    final String factsText = formatItemFactsText(item, now: widget.now);
    final Color accent = widget.look.accent;
    // The bridge refuses to plan a never item, so its row offers no tick.
    final VoidCallback? onToggle = isItemRemovable(item) ? widget.onToggle : null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Semantics(
                container: true,
                checked: widget.isSelected,
                enabled: onToggle != null,
                label: '${item.title}, $sizeText',
                child: Material(
                  type: MaterialType.transparency,
                  child: InkWell(
                    onTap: onToggle,
                    borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
                    hoverColor: accent.withValues(alpha: 0.05),
                    child: ExcludeSemantics(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: StageSpacing.small + 2,
                          vertical: StageSpacing.small + 2,
                        ),
                        child: Row(
                          children: [
                            StageCheckMark(
                              value: widget.isSelected,
                              accent: accent,
                              enabled: onToggle != null,
                            ),
                            const SizedBox(width: StageSpacing.regular),
                            Icon(
                              getItemGlyph(item.origin, sectionGlyph: widget.look.glyph),
                              size: 20,
                              color: accent.withValues(alpha: 0.9),
                            ),
                            const SizedBox(width: StageSpacing.medium),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    item.title,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: TypeRamp.label.copyWith(fontSize: 14),
                                  ),
                                  if (factsText.isNotEmpty) ...[
                                    const SizedBox(height: 2),
                                    Text(
                                      factsText,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TypeRamp.caption,
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(width: StageSpacing.regular),
                            Text(sizeText, style: TypeRamp.figure.copyWith(fontSize: 14)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: StageSpacing.tight),
            StageIconButton(
              icon: AppIcons.info,
              semanticsLabel: 'Details of ${item.title}',
              onPressed: _toggleDetails,
              isExpanded: _isDetailsOpen,
              accent: accent,
            ),
          ],
        ),
        if (_isDetailsOpen)
          ItemDetailsPanel(
            item: item,
            accent: accent,
            revealPaths: widget.revealPaths,
            urlOpener: widget.urlOpener,
          ),
      ],
    );
  }
}
