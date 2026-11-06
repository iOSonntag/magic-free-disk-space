import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/app_icons.dart';
import '../design/format_bytes.dart';
import '../design/glass_card.dart';
import '../design/glyph_tile.dart';
import '../design/motion.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import 'accent_button.dart';
import 'item_count_words.dart';

/// The word the bridge demands for every deletion; the app sends it on the
/// alert's Delete, and a plan with a careful item asks the user to type it.
const String deleteConfirmationWord = 'DELETE';

/// How many of the biggest items the alert names before "and N more".
const int _namedItemCount = 4;

/// Shows the alert that confirms the plan of [state], and acts on
/// [controller]: Delete deletes the plan, Cancel cancels it, and "Show list",
/// offered when [canShowList], closes the alert and leaves the plan for the
/// Review page. Completes once the alert is closed.
Future<void> showDeleteConfirmAlert({
  required BuildContext context,
  required CleanerController controller,
  required ConfirmingState state,
  required bool canShowList,
}) async {
  final bool isReduced = MotionScope.of(context).isReduced;
  final _AlertChoice? choice = await showDialog<_AlertChoice>(
    context: context,
    barrierDismissible: false,
    barrierColor: StageColors.nightDeep.withValues(alpha: 0.72),
    animationStyle: isReduced ? AnimationStyle.noAnimation : null,
    builder: (BuildContext _) =>
        _DeleteConfirmAlert(plan: state.plan, canShowList: canShowList),
  );
  // Delete deletes the plan the alert showed, so a state that moved on
  // while it was open is left alone.
  if (!identical(controller.state, state)) {
    return;
  }
  switch (choice) {
    case _AlertChoice.delete:
      await controller.confirmDeletion(deleteConfirmationWord);
    case _AlertChoice.showList:
      return;
    case _AlertChoice.cancel || null:
      controller.cancelConfirmation();
  }
}

enum _AlertChoice { delete, showList, cancel }

class _DeleteConfirmAlert extends StatefulWidget {
  const _DeleteConfirmAlert({required this.plan, required this.canShowList});

  final PlannedEvent plan;
  final bool canShowList;

  @override
  State<_DeleteConfirmAlert> createState() => _DeleteConfirmAlertState();
}

class _DeleteConfirmAlertState extends State<_DeleteConfirmAlert> {
  String _typedWord = '';

  /// A plan without a careful item needs no typed word; one with a careful
  /// item needs it exactly, so lower case is refused.
  bool get _canDelete =>
      !widget.plan.holdsCareful || _typedWord == deleteConfirmationWord;

  void _close(_AlertChoice choice) {
    Navigator.of(context).pop(choice);
  }

  @override
  Widget build(BuildContext context) {
    final PlannedEvent plan = widget.plan;
    final String totalText = formatBytes(plan.totalBytes);
    final List<PlannedItemView> biggestFirst = [...plan.items]
      ..sort(
        (PlannedItemView a, PlannedItemView b) =>
            b.allocatedBytes.compareTo(a.allocatedBytes),
      );
    final List<PlannedItemView> namedItems = biggestFirst
        .take(_namedItemCount)
        .toList();
    final int unnamedCount = biggestFirst.length - namedItems.length;
    return Actions(
      actions: {
        DismissIntent: CallbackAction<DismissIntent>(
          onInvoke: (DismissIntent _) {
            _close(_AlertChoice.cancel);
            return null;
          },
        ),
      },
      child: Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.all(StageSpacing.page),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: GlassCard(
            accent: StageColors.careful,
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const GlyphTile(
                      glyph: AppIcons.deleteForever,
                      accent: StageColors.careful,
                    ),
                    const SizedBox(width: StageSpacing.regular),
                    Expanded(
                      child: Semantics(
                        header: true,
                        child: Text(
                          'Delete $totalText for good?',
                          style: TypeRamp.headline,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: StageSpacing.large),
                Text(
                  'These skip the Trash, so they cannot come back:',
                  style: TypeRamp.body,
                ),
                const SizedBox(height: StageSpacing.small),
                for (final PlannedItemView item in namedItems)
                  _NamedItemLine(item: item),
                if (unnamedCount > 0)
                  Padding(
                    padding: const EdgeInsets.only(top: StageSpacing.tight),
                    child: Text(
                      formatMoreItems(unnamedCount),
                      style: TypeRamp.caption,
                    ),
                  ),
                if (plan.holdsCareful) ...[
                  const SizedBox(height: StageSpacing.large),
                  _CarefulConfirmation(
                    carefulTitles: [
                      for (final PlannedItemView item in biggestFirst)
                        if (item.risk == Risk.careful) item.title,
                    ],
                    onChanged: (String word) => setState(() => _typedWord = word),
                    onSubmitted: () {
                      if (_canDelete) {
                        _close(_AlertChoice.delete);
                      }
                    },
                  ),
                ],
                const SizedBox(height: StageSpacing.large),
                OverflowBar(
                  alignment: MainAxisAlignment.end,
                  overflowAlignment: OverflowBarAlignment.end,
                  spacing: StageSpacing.small,
                  overflowSpacing: StageSpacing.small,
                  children: [
                    if (widget.canShowList)
                      QuietButton(
                        label: 'Show list',
                        onPressed: () => _close(_AlertChoice.showList),
                      ),
                    QuietButton(
                      label: 'Cancel',
                      autofocus: !plan.holdsCareful,
                      onPressed: () => _close(_AlertChoice.cancel),
                    ),
                    AccentButton(
                      label: 'Delete',
                      icon: AppIcons.deleteForever,
                      accent: StageColors.careful,
                      onPressed: _canDelete ? () => _close(_AlertChoice.delete) : null,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NamedItemLine extends StatelessWidget {
  const _NamedItemLine({required this.item});

  final PlannedItemView item;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: StageSpacing.tight),
      child: Row(
        children: [
          Expanded(
            child: Text(
              item.title,
              style: TypeRamp.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: StageSpacing.medium),
          Text(
            formatBytes(item.allocatedBytes),
            style: TypeRamp.caption.copyWith(color: StageColors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// The careful part of the alert: what can't be undone, and the field for
/// the typed word.
class _CarefulConfirmation extends StatelessWidget {
  const _CarefulConfirmation({
    required this.carefulTitles,
    required this.onChanged,
    required this.onSubmitted,
  });

  final List<String> carefulTitles;
  final ValueChanged<String> onChanged;
  final VoidCallback onSubmitted;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(StageSpacing.medium),
          decoration: BoxDecoration(
            color: StageColors.careful.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
            border: Border.all(color: StageColors.careful.withValues(alpha: 0.4)),
          ),
          child: Text(
            carefulTitles.isEmpty
                ? "Some of these can't be undone or downloaded again."
                : "Can't be undone or downloaded again: ${_formatTitleList(carefulTitles)}.",
            style: TypeRamp.body.copyWith(color: StageColors.textPrimary),
          ),
        ),
        const SizedBox(height: StageSpacing.regular),
        TextField(
          autofocus: true,
          autocorrect: false,
          enableSuggestions: false,
          onChanged: onChanged,
          onSubmitted: (String _) => onSubmitted(),
          style: TypeRamp.label.copyWith(letterSpacing: 2),
          decoration: const InputDecoration(
            labelText: 'Type $deleteConfirmationWord to confirm',
            border: OutlineInputBorder(),
          ),
        ),
      ],
    );
  }
}

/// Names the first three of [titles], and how many more there are.
String _formatTitleList(List<String> titles) {
  const int namedCount = 3;
  if (titles.length <= namedCount) {
    return titles.join(', ');
  }
  final int moreCount = titles.length - namedCount;
  return '${titles.take(namedCount).join(', ')} and $moreCount more';
}
