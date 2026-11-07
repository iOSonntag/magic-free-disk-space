import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../feedback/feedback.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'accent_button.dart';
import 'lines_details.dart';

/// The Result step: what the run of [state] freed and kept, its details, and
/// its log, which [urlOpener] shows in Finder. The shell shows it for every
/// [DeletedState].
class DeletedPage extends StatefulWidget {
  const DeletedPage({
    super.key,
    required this.state,
    required this.controller,
    required this.urlOpener,
  });

  final DeletedState state;
  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  State<DeletedPage> createState() => _DeletedPageState();
}

class _DeletedPageState extends State<DeletedPage> {
  bool _hasLogFailed = false;

  Future<void> _showLog(RevealUrl logUrl) async {
    final bool isOpened = await widget.urlOpener.open(logUrl);
    if (!mounted) {
      return;
    }
    setState(() => _hasLogFailed = !isOpened);
  }

  @override
  Widget build(BuildContext context) {
    final DeletedEvent result = widget.state.result;
    final Map<int, PlannedItemView> plannedItems = {
      for (final PlannedItemView item in widget.state.plan.items)
        item.number: item,
    };
    final List<DeletedOutcomeView> stayedOutcomes = [
      for (final DeletedOutcomeView outcome in result.outcomes)
        if (outcome.outcome != DeletedOutcome.removed) outcome,
    ];
    final int removedCount = result.outcomes.length - stayedOutcomes.length;
    final String? logPath = result.logPath;
    final RevealUrl? logUrl = RevealUrl.tryParse(logPath, allowedPaths: {?logPath});
    return Material(
      type: MaterialType.transparency,
      child: Column(
        children: [
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 760),
                child: ListView(
                  padding: const EdgeInsets.all(StageSpacing.page),
                  children: [
                    _FreedHero(
                      result: result,
                      diskBefore: widget.state.scan.summary.disk,
                      plannedBytes: widget.state.plan.totalBytes,
                    ),
                    const SizedBox(height: StageSpacing.large),
                    _RunFacts(result: result, removedCount: removedCount),
                    if (stayedOutcomes.isNotEmpty) ...[
                      const SizedBox(height: StageSpacing.large),
                      _StayedCard(
                        outcomes: stayedOutcomes,
                        plannedItems: plannedItems,
                      ),
                    ],
                    const SizedBox(height: StageSpacing.large),
                    LinesDetails(lines: result.lines),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(StageSpacing.large),
            child: Row(
              children: [
                if (logUrl != null)
                  QuietButton(
                    label: 'Show log',
                    icon: AppIcons.showLog,
                    onPressed: () => _showLog(logUrl),
                  ),
                Expanded(
                  child: _hasLogFailed
                      ? const Padding(
                          padding: EdgeInsets.only(left: StageSpacing.small),
                          child: ErrorText(
                            text: 'The log could not be shown in Finder.',
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
                AccentButton(
                  label: 'Done',
                  icon: AppIcons.check,
                  accent: StageColors.safe,
                  onPressed: widget.controller.finishDeletion,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// The freed space, inside the disk ring when the disk is known before and
/// after the run.
class _FreedHero extends StatelessWidget {
  const _FreedHero({
    required this.result,
    required this.diskBefore,
    required this.plannedBytes,
  });

  final DeletedEvent result;
  final DiskSpaceView? diskBefore;
  final int plannedBytes;

  @override
  Widget build(BuildContext context) {
    final Widget freed = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('FREED', style: TypeRamp.overline),
        const SizedBox(height: StageSpacing.tight),
        CountUp(
          value: result.freedBytes,
          format: formatBytes,
          style: TypeRamp.display,
        ),
      ],
    );
    final DiskSpaceView? before = diskBefore;
    final int? availableBytesAfter = result.availableBytesAfter;
    if (before == null || availableBytesAfter == null) {
      return Column(
        children: [
          const GlyphTile(
            glyph: AppIcons.removed,
            accent: StageColors.safe,
            size: 64,
          ),
          const SizedBox(height: StageSpacing.large),
          freed,
        ],
      );
    }
    return Center(
      child: SizedBox.square(
        dimension: 320,
        child: _BeforeAfterRing(
          before: DiskRingVolumeReading(
            capacityBytes: before.capacityBytes,
            availableBytes: before.availableBytes,
            freeableBytes: plannedBytes,
          ),
          after: DiskRingVolumeReading(
            capacityBytes: before.capacityBytes,
            availableBytes: availableBytesAfter,
            freeableBytes: 0,
          ),
          semanticsLabel:
              '${formatBytes(availableBytesAfter)} free of '
              '${formatBytes(before.capacityBytes)}',
          center: freed,
        ),
      ),
    );
  }
}

/// A disk ring that shows [before] and then turns to [after], so the space
/// the run freed drains from the lit arc; under reduced motion it shows
/// [after] at once.
class _BeforeAfterRing extends StatefulWidget {
  const _BeforeAfterRing({
    required this.before,
    required this.after,
    required this.semanticsLabel,
    required this.center,
  });

  final DiskRingReading before;
  final DiskRingReading after;
  final String semanticsLabel;
  final Widget center;

  @override
  State<_BeforeAfterRing> createState() => _BeforeAfterRingState();
}

class _BeforeAfterRingState extends State<_BeforeAfterRing>
    with SingleTickerProviderStateMixin {
  /// Holds [_BeforeAfterRing.before] while the ring fills to it.
  late final AnimationController _beforeHold = AnimationController(
    vsync: this,
    duration: MotionTokens.ringFill,
  )..addStatusListener(_turnToAfter);
  bool _showsAfter = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MotionScope.of(context).isReduced) {
      _beforeHold.stop();
      _showsAfter = true;
      return;
    }
    if (!_showsAfter && !_beforeHold.isAnimating) {
      _beforeHold.forward();
    }
  }

  @override
  void dispose() {
    _beforeHold.dispose();
    super.dispose();
  }

  void _turnToAfter(AnimationStatus status) {
    if (status == AnimationStatus.completed) {
      setState(() => _showsAfter = true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DiskRing(
      reading: _showsAfter ? widget.after : widget.before,
      accent: StageColors.safe,
      isScanning: false,
      semanticsLabel: widget.semanticsLabel,
      center: widget.center,
    );
  }
}

class _RunFacts extends StatelessWidget {
  const _RunFacts({required this.result, required this.removedCount});

  final DeletedEvent result;
  final int removedCount;

  @override
  Widget build(BuildContext context) {
    final int? availableBytesAfter = result.availableBytesAfter;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FactLine(
          glyph: AppIcons.removed,
          accent: StageColors.safe,
          text: removedCount == 0
              ? 'Nothing was removed.'
              : '${formatItemCount(removedCount)} removed.',
        ),
        if (result.returnsLaterBytes > 0)
          _FactLine(
            glyph: AppIcons.returnsLater,
            accent: StageColors.overviewAccent,
            text:
                '${formatBytes(result.returnsLaterBytes)} more comes back '
                'within minutes, as the container engine gives it up.',
          ),
        if (availableBytesAfter != null)
          _FactLine(
            glyph: AppIcons.disk,
            accent: StageColors.textSecondary,
            text: '${formatBytes(availableBytesAfter)} free on the disk now.',
          ),
      ],
    );
  }
}

class _FactLine extends StatelessWidget {
  const _FactLine({
    required this.glyph,
    required this.accent,
    required this.text,
  });

  final IconData glyph;
  final Color accent;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: StageSpacing.small),
      child: Row(
        children: [
          ExcludeSemantics(child: Icon(glyph, size: 20, color: accent, fill: 1)),
          const SizedBox(width: StageSpacing.medium),
          Expanded(
            child: Text(
              text,
              style: TypeRamp.body.copyWith(color: StageColors.textPrimary),
            ),
          ),
        ],
      ),
    );
  }
}

/// The items the run left, each with what happened and why.
class _StayedCard extends StatelessWidget {
  const _StayedCard({required this.outcomes, required this.plannedItems});

  final List<DeletedOutcomeView> outcomes;
  final Map<int, PlannedItemView> plannedItems;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      accent: StageColors.review,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const GlyphTile(
                glyph: AppIcons.kept,
                accent: StageColors.review,
                size: 40,
              ),
              const SizedBox(width: StageSpacing.medium),
              Text('What stayed', style: TypeRamp.title),
            ],
          ),
          for (final DeletedOutcomeView outcome in outcomes)
            _StayedRow(
              outcome: outcome,
              title: plannedItems[outcome.number]?.title ?? 'Item ${outcome.number}',
            ),
        ],
      ),
    );
  }
}

class _StayedRow extends StatelessWidget {
  const _StayedRow({required this.outcome, required this.title});

  final DeletedOutcomeView outcome;
  final String title;

  @override
  Widget build(BuildContext context) {
    final ({String text, IconData glyph, Color color}) verdict = _describeOutcome(
      outcome,
    );
    return Padding(
      padding: const EdgeInsets.only(top: StageSpacing.medium),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(
            child: Icon(verdict.glyph, size: 18, color: verdict.color, fill: 1),
          ),
          const SizedBox(width: StageSpacing.medium),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TypeRamp.label),
                Text(
                  [verdict.text, ?_formatDeletedReason(outcome.reasonKey)].join(' '),
                  style: TypeRamp.caption.copyWith(color: StageColors.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// What happened to the item of [outcome], in a few words, and its mark.
({String text, IconData glyph, Color color}) _describeOutcome(
  DeletedOutcomeView outcome,
) {
  return switch (outcome.outcome) {
    DeletedOutcome.partlyRemoved => (
      text: 'Partly removed, ${formatBytes(outcome.freedBytes)} freed.',
      glyph: AppIcons.partlyRemoved,
      color: StageColors.review,
    ),
    DeletedOutcome.failed => (
      text: 'Not removed.',
      glyph: AppIcons.failed,
      color: StageColors.careful,
    ),
    DeletedOutcome.kept || DeletedOutcome.unknown => (
      text: 'Kept.',
      glyph: AppIcons.kept,
      color: StageColors.review,
    ),
    DeletedOutcome.removed => (
      text: 'Removed.',
      glyph: AppIcons.removed,
      color: StageColors.safe,
    ),
  };
}

/// Why the run left an item, in plain words; `null` when the bridge named
/// no reason the app knows.
String? _formatDeletedReason(DeletedReason? reason) {
  return switch (reason) {
    null || DeletedReason.unknown => null,
    DeletedReason.alreadyGone => 'It was already gone.',
    DeletedReason.changedSinceScan =>
      'It changed since the scan, so it was left alone.',
    DeletedReason.ownerRunning =>
      'Its app is open, so it was left alone. Quit the app and try again.',
    DeletedReason.notAttempted => 'It was not tried this time.',
    DeletedReason.permissionDenied => 'macOS did not allow it to be removed.',
    DeletedReason.failed => 'Removing it failed.',
    DeletedReason.toolFailed => 'The tool that removes it reported an error.',
    DeletedReason.engineInUse => 'Its container engine still uses it.',
    DeletedReason.engineNotRunning =>
      'Its container engine is not running, so it was left alone.',
  };
}
