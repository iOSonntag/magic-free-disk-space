import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';
import 'biggest_items.dart';
import 'size_ease.dart';

/// How many of the biggest items the view shows; the rest dissolve as one
/// "and N more" row.
const int _shownItemCount = 6;

/// The pause before the first row dissolves, so the view lands first.
const Duration _dissolveLead = Duration(milliseconds: 360);

/// The time between two rows starting to dissolve.
const Duration _dissolveStep = Duration(milliseconds: 180);

/// The step while the bridge deletes, shown for every [DeletingState]: the
/// biggest items of its plan dissolve one after another, or all at once in
/// a plain fade under reduced motion.
class DeletingView extends StatefulWidget {
  const DeletingView({super.key, required this.state});

  final DeletingState state;

  @override
  State<DeletingView> createState() => _DeletingViewState();
}

class _DeletingViewState extends State<DeletingView>
    with SingleTickerProviderStateMixin {
  late final List<PlannedItemView> _shownItems;
  late final int _moreCount;
  late final Duration _staggerDuration;
  late final AnimationController _stagger;
  int _dissolvedCount = 0;

  /// Whether the last row has dissolved, so the card says the run goes on.
  bool _isCleared = false;

  int get _rowCount => _shownItems.length + (_moreCount > 0 ? 1 : 0);

  @override
  void initState() {
    super.initState();
    final BiggestItems biggestItems = buildBiggestItems(
      widget.state.plan.items,
      shownCount: _shownItemCount,
    );
    _shownItems = biggestItems.shownItems;
    _moreCount = biggestItems.moreCount;
    _staggerDuration = _dissolveLead + _dissolveStep * math.max(_rowCount - 1, 0);
    _stagger = AnimationController(vsync: this, duration: _staggerDuration)
      ..addListener(_updateDissolvedCount);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MotionScope.of(context).isReduced) {
      _stagger.stop();
      // The rows show for one frame first, so they fade rather than vanish.
      WidgetsBinding.instance.addPostFrameCallback((Duration _) {
        if (mounted) {
          setState(() => _dissolvedCount = _rowCount);
        }
      });
      return;
    }
    if (!_stagger.isAnimating && _dissolvedCount < _rowCount) {
      _stagger.forward();
    }
  }

  @override
  void dispose() {
    _stagger.dispose();
    super.dispose();
  }

  void _updateDissolvedCount() {
    final int dissolvedCount = _countDissolvedRows(
      elapsed: _staggerDuration * _stagger.value,
    );
    if (dissolvedCount != _dissolvedCount) {
      setState(() => _dissolvedCount = dissolvedCount);
    }
  }

  /// Runs after the frame, because a dissolve can end while its row builds,
  /// such as when Reduce Motion turns on.
  void _markCleared() {
    WidgetsBinding.instance.addPostFrameCallback((Duration _) {
      if (mounted && !_isCleared) {
        setState(() => _isCleared = true);
      }
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  int _countDissolvedRows({required Duration elapsed}) {
    if (elapsed < _dissolveLead) {
      return 0;
    }
    final int startedAfterLead =
        (elapsed - _dissolveLead).inMicroseconds ~/ _dissolveStep.inMicroseconds;
    return math.min(1 + startedAfterLead, _rowCount);
  }

  @override
  Widget build(BuildContext context) {
    final String totalText = formatBytes(widget.state.plan.totalBytes);
    return Material(
      type: MaterialType.transparency,
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(StageSpacing.page),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const GlyphTile(
                  glyph: AppIcons.deleteForever,
                  accent: StageColors.careful,
                  size: 64,
                ),
                const SizedBox(height: StageSpacing.large),
                Semantics(
                  liveRegion: true,
                  child: Text('Deleting $totalText', style: TypeRamp.headline),
                ),
                const SizedBox(height: StageSpacing.small),
                Text(
                  'The items skip the Trash. Keep the app open until this is done.',
                  style: TypeRamp.body,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: StageSpacing.large),
                GlassCard(
                  accent: StageColors.careful,
                  child: SizeEase(
                    child: _isCleared
                        ? Padding(
                            padding: const EdgeInsets.symmetric(
                              vertical: StageSpacing.small,
                            ),
                            child: Text(
                              'Still deleting. This can take a minute.',
                              style: TypeRamp.caption,
                              textAlign: TextAlign.center,
                            ),
                          )
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final (int index, PlannedItemView item)
                                  in _shownItems.indexed)
                                Dissolve(
                                  isDissolved: index < _dissolvedCount,
                                  accent: sectionKeyToLook(item.sectionKey).accent,
                                  onDissolved: index == _rowCount - 1 ? _markCleared : null,
                                  child: _DeletingRow(item: item),
                                ),
                              if (_moreCount > 0)
                                Dissolve(
                                  isDissolved: _shownItems.length < _dissolvedCount,
                                  accent: StageColors.careful,
                                  onDissolved: _markCleared,
                                  child: _MoreRow(count: _moreCount),
                                ),
                            ],
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DeletingRow extends StatelessWidget {
  const _DeletingRow({required this.item});

  final PlannedItemView item;

  @override
  Widget build(BuildContext context) {
    final SectionLook look = sectionKeyToLook(item.sectionKey);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: StageSpacing.small),
      child: Row(
        children: [
          GlyphTile(glyph: look.glyph, accent: look.accent, size: 32),
          const SizedBox(width: StageSpacing.medium),
          Expanded(
            child: Text(
              item.title,
              style: TypeRamp.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: StageSpacing.medium),
          Text(formatBytes(item.allocatedBytes), style: TypeRamp.figure),
        ],
      ),
    );
  }
}

class _MoreRow extends StatelessWidget {
  const _MoreRow({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: StageSpacing.small),
      child: Text(formatMoreItems(count), style: TypeRamp.caption),
    );
  }
}
