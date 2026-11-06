import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/app_icons.dart';
import '../design/format_bytes.dart';
import '../design/glass_card.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../removal/item_count_words.dart';
import '../section/section_contents.dart';
import 'stage_button.dart';

/// The bar that floats over the pages while anything is ticked: how much,
/// "Clear", and "Review", which asks the bridge for the plan of the one
/// selection across all sections.
class SelectionBar extends StatelessWidget {
  const SelectionBar({super.key, required this.state, required this.controller});

  final ScannedState state;
  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    final List<ItemView> selectedItems = listSelectedItems(
      state.scan,
      state.selectedNumbers,
    );
    final ({int allocatedBytes, bool isComplete}) size = sumItemSizes(selectedItems);
    final String countText = formatItemCount(selectedItems.length);
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 640),
      child: GlassCard(
        accent: StageColors.overviewAccent,
        padding: const EdgeInsets.symmetric(
          horizontal: StageSpacing.large - 4,
          vertical: StageSpacing.medium,
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('$countText selected', style: TypeRamp.title),
                  Text(
                    formatSizeText(
                      allocatedBytes: size.allocatedBytes,
                      isComplete: size.isComplete,
                    ),
                    style: TypeRamp.caption,
                  ),
                ],
              ),
            ),
            StageButton(
              label: 'Clear',
              semanticsLabel: 'Clear the selection',
              onPressed: controller.clearSelection,
            ),
            const SizedBox(width: StageSpacing.small),
            StageButton(
              label: 'Review',
              semanticsLabel: 'Review the $countText selected',
              icon: AppIcons.forward,
              tone: StageButtonTone.primary,
              onPressed: controller.requestPlan,
            ),
          ],
        ),
      ),
    );
  }
}
