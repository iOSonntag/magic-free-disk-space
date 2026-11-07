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
    final String totalText = formatBytes(state.plan.totalBytes);
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
                      totalBytes: state.plan.totalBytes,
                      reach: RemovalReach.split(items),
                      isReplanning: isReplanning,
                    ),
                    if (state.plan.holdsCareful) ...[
                      const SizedBox(height: StageSpacing.large),
                      const _CarefulNote(),
                    ],
                    for (final _SectionGroup group in _groupBySection(items)) ...[
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

/// The items of one section of the plan, in the plan's order.
typedef _SectionGroup = ({SectionKey sectionKey, List<PlannedItemView> items});

/// Groups [items] by section, in the order of the sections.
List<_SectionGroup> _groupBySection(List<PlannedItemView> items) {
  return [
    for (final SectionKey sectionKey in SectionKey.values)
      if (items.any((PlannedItemView item) => item.sectionKey == sectionKey))
        (
          sectionKey: sectionKey,
          items: [
            for (final PlannedItemView item in items)
              if (item.sectionKey == sectionKey) item,
          ],
        ),
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
    required this.totalBytes,
    required this.reach,
    required this.isReplanning,
  });

  final int totalBytes;
  final RemovalReach reach;
  final bool isReplanning;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('REVIEW', style: TypeRamp.overline),
        const SizedBox(height: StageSpacing.small),
        AnimatedOpacity(
          opacity: isReplanning ? 0.45 : 1,
          duration: MotionScope.of(context).plainFadeDuration,
          child: CountUp(
            value: totalBytes,
            format: formatBytes,
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
  final List<String> sentences = [
    if (finalCount == 1)
      '1 item goes for good. It skips the Trash, so it cannot come back.'
    else if (finalCount > 1)
      '$finalCount items go for good. They skip the Trash, so they cannot come back.',
    if (reach.evictedItems.isNotEmpty) formatStaysInIcloudText(reach.evictedBytes),
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
              'Some of these can\'t be undone or downloaded again. '
              'The next step asks you to type $deleteConfirmationWord.',
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
    final int sectionBytes = group.items.fold(
      0,
      (int sum, PlannedItemView item) => sum + item.allocatedBytes,
    );
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
                  child: Text(look.title, style: TypeRamp.title),
                ),
                Text(formatBytes(sectionBytes), style: TypeRamp.figure),
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
    final String sizeText = formatBytes(item.allocatedBytes);
    final ShownItemGroup group = riskToShownItemGroup(item.risk);
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
