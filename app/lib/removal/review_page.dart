import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';
import 'accent_button.dart';
import 'delete_confirm_alert.dart';
import 'lines_details.dart';
import 'removal_reach.dart';
import 'size_ease.dart';

/// The Review step: lists what the plan of [state] deletes, and opens the
/// delete alert from its "Delete" button. The shell shows it for every
/// [ConfirmingState].
class ReviewPage extends StatelessWidget {
  const ReviewPage({super.key, required this.state, required this.controller});

  final ConfirmingState state;
  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    final List<PlannedItemView> items = [
      for (final PlannedItemView item in state.plan.items)
        if (state.selectedNumbers.contains(item.number)) item,
    ];
    final bool isReplanning = state.isReplanning;
    final String totalText = formatPlanTotalText(state.plan);
    return Material(
      type: MaterialType.transparency,
      child: Column(
        children: [
          _ReviewHeader(onBack: controller.cancelConfirmation),
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(
                    StageSpacing.page,
                    StageSpacing.regular,
                    StageSpacing.page,
                    StageSpacing.page,
                  ),
                  children: [
                    _ReviewHero(
                      plan: state.plan,
                      reach: RemovalReach.split(items),
                      isReplanning: isReplanning,
                    ),
                    if (state.plan.holdsCareful) ...[
                      const SizedBox(height: StageSpacing.large),
                      const _CarefulNote(),
                    ],
                    for (final _SectionGroup group in _groupBySection(
                      items,
                      mergeSectionTotalsByKey(state.scan.sectionTotals),
                    )) ...[
                      const SizedBox(height: StageSpacing.large),
                      _SectionCard(
                        group: group,
                        onRemove: isReplanning
                            ? null
                            : (int number) => controller.removeCandidateFromPlan(number),
                      ),
                    ],
                    const SizedBox(height: StageSpacing.large),
                    LinesDetails(lines: state.plan.lines),
                  ],
                ),
              ),
            ),
          ),
          _ReviewFooter(
            label: isReplanning ? 'Updating the list…' : 'Delete $totalText',
            onDelete: isReplanning
                ? null
                : () => showDeleteConfirmAlert(
                    context: context,
                    controller: controller,
                    state: state,
                    origin: DeleteAlertOrigin.review,
                  ),
          ),
        ],
      ),
    );
  }
}

/// The items of one section of the plan, in the plan's order; [title] is
/// `null` for a section the scan's totals do not name.
typedef _SectionGroup = ({SectionKey sectionKey, String? title, List<PlannedItemView> items});

/// Groups [items] by section in the order and with the titles of [totals],
/// one per key; the items of a key [totals] lacks follow, never dropped.
List<_SectionGroup> _groupBySection(List<PlannedItemView> items, List<SectionTotal> totals) {
  final Map<SectionKey, List<PlannedItemView>> itemsByKey = {};
  for (final PlannedItemView item in items) {
    (itemsByKey[item.sectionKey] ??= []).add(item);
  }
  final Set<SectionKey> totalKeys = {for (final SectionTotal total in totals) total.sectionKey};
  return [
    for (final SectionTotal total in totals)
      if (itemsByKey[total.sectionKey] case final List<PlannedItemView> sectionItems)
        (sectionKey: total.sectionKey, title: total.titleText, items: sectionItems),
    for (final MapEntry<SectionKey, List<PlannedItemView>> entry in itemsByKey.entries)
      if (!totalKeys.contains(entry.key)) (sectionKey: entry.key, title: null, items: entry.value),
  ];
}

class _ReviewHeader extends StatelessWidget {
  const _ReviewHeader({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        StageSpacing.regular,
        StageSpacing.regular,
        StageSpacing.regular,
        0,
      ),
      child: Row(
        children: [
          QuietButton(label: 'Back', icon: AppIcons.back, onPressed: onBack),
          const Spacer(),
        ],
      ),
    );
  }
}

class _ReviewHero extends StatelessWidget {
  const _ReviewHero({
    required this.plan,
    required this.reach,
    required this.isReplanning,
  });

  final PlannedEvent plan;
  final RemovalReach reach;
  final bool isReplanning;

  @override
  Widget build(BuildContext context) {
    final bool isComplete = sumPlannedItemSizes(plan.items).isComplete;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('REVIEW', style: TypeRamp.overline),
        const SizedBox(height: StageSpacing.small),
        AnimatedOpacity(
          opacity: isReplanning ? 0.45 : 1,
          duration: MotionScope.of(context).plainFadeDuration,
          child: CountUp(
            value: plan.totalBytes,
            format: (int allocatedBytes) => formatSizeText(
              allocatedBytes: allocatedBytes,
              isComplete: isComplete,
            ),
            style: TypeRamp.display,
          ),
        ),
        const SizedBox(height: StageSpacing.small),
        Text(_formatReachText(reach), style: TypeRamp.body),
      ],
    );
  }
}

/// What the plan's removal leaves: the items gone for good, and the bytes
/// that stay in iCloud.
String _formatReachText(RemovalReach reach) {
  final int finalCount = reach.finalItems.length;
  final String finalFateText = finalCount == 1
      ? 'goes for good. It skips the Trash, so it cannot come back.'
      : 'go for good. They skip the Trash, so they cannot come back.';
  final List<String> sentences = [
    if (finalCount > 0) '${formatItemCount(finalCount)} $finalFateText',
    if (reach.evictedItems.isNotEmpty) formatStaysInIcloudText(reach.evictedSize),
  ];
  return sentences.join(' ');
}

class _CarefulNote extends StatelessWidget {
  const _CarefulNote();

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      accent: StageColors.careful,
      padding: const EdgeInsets.all(StageSpacing.regular),
      child: Row(
        children: [
          const GlyphTile(
            glyph: AppIcons.carefulGroup,
            accent: StageColors.careful,
            size: 36,
          ),
          const SizedBox(width: StageSpacing.medium),
          Expanded(
            child: Text(
              '$carefulItemsWarningText The next step asks you to type $deleteConfirmationWord.',
              style: TypeRamp.body.copyWith(color: StageColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.group, required this.onRemove});

  final _SectionGroup group;

  /// Takes the item of a number off the plan; null while that is not
  /// possible.
  final void Function(int number)? onRemove;

  @override
  Widget build(BuildContext context) {
    final SectionLook look = sectionKeyToLook(group.sectionKey);
    final String? title = group.title;
    return GlassCard(
      accent: look.accent,
      child: SizeEase(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                GlyphTile(glyph: look.glyph, accent: look.accent, size: 40),
                const SizedBox(width: StageSpacing.medium),
                Expanded(
                  child: title == null ? const SizedBox.shrink() : Text(title, style: TypeRamp.title),
                ),
                Text(formatItemSizeSumText(sumPlannedItemSizes(group.items)), style: TypeRamp.figure),
              ],
            ),
            const SizedBox(height: StageSpacing.small),
            for (final PlannedItemView item in group.items)
              _ReviewRow(
                key: ValueKey<int>(item.number),
                item: item,
                onRemove: onRemove,
              ),
          ],
        ),
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({super.key, required this.item, required this.onRemove});

  final PlannedItemView item;
  final void Function(int number)? onRemove;

  @override
  Widget build(BuildContext context) {
    final String sizeText = formatPlannedItemSizeText(item);
    final ShownItemGroup group = itemGroupToShownItemGroup(item.group);
    final String groupTitle = formatGroupTitle(group);
    final Color tone = getGroupTone(group);
    final void Function(int number)? remove = onRemove;
    return Semantics(
      container: true,
      label: '${item.title}, $sizeText, $groupTitle',
      child: Padding(
        padding: const EdgeInsets.only(top: StageSpacing.small),
        child: Row(
          children: [
            ExcludeSemantics(
              child: Icon(getGroupGlyph(group), size: 18, color: tone, fill: 1),
            ),
            const SizedBox(width: StageSpacing.medium),
            Expanded(
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      style: TypeRamp.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      groupTitle,
                      style: TypeRamp.caption.copyWith(color: tone),
                    ),
                  ],
                ),
              ),
            ),
            ExcludeSemantics(child: Text(sizeText, style: TypeRamp.figure)),
            const SizedBox(width: StageSpacing.small),
            IconButton(
              tooltip: 'Keep ${item.title}',
              onPressed: remove == null ? null : () => remove(item.number),
              icon: const Icon(AppIcons.close, size: 18),
              color: StageColors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewFooter extends StatelessWidget {
  const _ReviewFooter({required this.label, required this.onDelete});

  final String label;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(StageSpacing.large),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          AccentButton(
            label: label,
            icon: AppIcons.deleteForever,
            accent: StageColors.careful,
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
