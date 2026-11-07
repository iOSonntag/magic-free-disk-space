import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';
import 'accent_button.dart';
import 'biggest_items.dart';
import 'removal_reach.dart';

/// The word the bridge demands for every deletion; the app sends it on the
/// alert's Delete, and a plan with a careful item asks the user to type it.
const String deleteConfirmationWord = 'DELETE';

/// The warning of a plan with a careful item, wherever the delete flow
/// gives it without naming the items.
const String carefulItemsWarningText = "Some of these can't be undone or downloaded again.";

/// How many of the biggest items the alert names before "and N more".
const int _namedItemCount = 4;

/// How many careful titles the alert names before "and N more".
const int _namedCarefulCount = 3;

/// Where the delete alert opens from, which decides what its Cancel leaves.
enum DeleteAlertOrigin {
  /// "Clean safe items": the alert stands alone, Cancel drops the plan, and
  /// "Show list" leaves it for the Review page.
  cleanSafeItems,

  /// The Review page: Cancel closes the alert and keeps Review.
  review,
}

/// Shows the alert that confirms the plan of [state], and acts on
/// [controller]: Delete deletes the plan, and Cancel and "Show list" do what
/// [origin] says. Completes once the alert is closed.
Future<void> showDeleteConfirmAlert({
  required BuildContext context,
  required CleanerController controller,
  required ConfirmingState state,
  required DeleteAlertOrigin origin,
}) async {
  final bool isReduced = MotionScope.of(context).isReduced;
  final _AlertChoice? choice = await showDialog<_AlertChoice>(
    context: context,
    barrierDismissible: false,
    barrierColor: StageColors.nightDeep.withValues(alpha: 0.72),
    animationStyle: isReduced ? AnimationStyle.noAnimation : null,
    builder: (BuildContext _) => _DeleteConfirmAlert(plan: state.plan, origin: origin),
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
      switch (origin) {
        case DeleteAlertOrigin.cleanSafeItems:
          controller.cancelConfirmation();
        case DeleteAlertOrigin.review:
          return;
      }
  }
}

enum _AlertChoice { delete, showList, cancel }

/// "Delete 10 MB for good?", or for a plan that only evicts, what leaves
/// this Mac.
String _formatHeadlineText(RemovalReach reach) {
  if (reach.finalItems.isEmpty) {
    return 'Remove ${_formatSizeSumText(reach.evictedSize)} from this Mac?';
  }
  return 'Delete ${_formatSizeSumText(reach.finalSize)} for good?';
}

String _formatSizeSumText(ItemSizeSum size) {
  return formatSizeText(allocatedBytes: size.allocatedBytes, isComplete: size.isComplete);
}

class _DeleteConfirmAlert extends StatefulWidget {
  const _DeleteConfirmAlert({required this.plan, required this.origin});

  final PlannedEvent plan;
  final DeleteAlertOrigin origin;

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
    final RemovalReach reach = RemovalReach.split(plan.items);
    final BiggestItems finalItems = buildBiggestItems(
      reach.finalItems,
      shownCount: _namedItemCount,
    );
    final bool canShowList = switch (widget.origin) {
      DeleteAlertOrigin.cleanSafeItems => true,
      DeleteAlertOrigin.review => false,
    };
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
                          _formatHeadlineText(reach),
                          style: TypeRamp.headline,
                        ),
                      ),
                    ),
                  ],
                ),
                if (finalItems.shownItems.isNotEmpty) ...[
                  const SizedBox(height: StageSpacing.large),
                  Text(
                    'These skip the Trash, so they cannot come back:',
                    style: TypeRamp.body,
                  ),
                  const SizedBox(height: StageSpacing.small),
                  for (final PlannedItemView item in finalItems.shownItems)
                    _NamedItemLine(item: item),
                  if (finalItems.moreCount > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: StageSpacing.tight),
                      child: Text(
                        formatMoreItems(finalItems.moreCount),
                        style: TypeRamp.caption,
                      ),
                    ),
                ],
                if (reach.evictedItems.isNotEmpty) ...[
                  const SizedBox(height: StageSpacing.large),
                  Text(
                    formatStaysInIcloudText(reach.evictedSize),
                    style: TypeRamp.body,
                  ),
                ],
                if (plan.holdsCareful) ...[
                  const SizedBox(height: StageSpacing.large),
                  _CarefulConfirmation(
                    carefulItems: buildBiggestItems(
                      [
                        for (final PlannedItemView item in plan.items)
                          if (item.group == ItemGroup.careful) item,
                      ],
                      shownCount: _namedCarefulCount,
                    ),
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
                    if (canShowList)
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
            formatPlannedItemSizeText(item),
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
    required this.carefulItems,
    required this.onChanged,
    required this.onSubmitted,
  });

  final BiggestItems carefulItems;
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
            carefulItems.shownItems.isEmpty
                ? carefulItemsWarningText
                : "Can't be undone or downloaded again: ${_formatTitleList(carefulItems)}.",
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

/// The titles of the shown items of [items], and how many more there are.
String _formatTitleList(BiggestItems items) {
  final String namedText = items.shownItems
      .map((PlannedItemView item) => item.title)
      .join(', ');
  if (items.moreCount == 0) {
    return namedText;
  }
  return '$namedText and ${items.moreCount} more';
}
