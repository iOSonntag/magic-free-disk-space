import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';

const double _ringSide = 248;

/// What the Overview's ring and its words show for one state.
final class DiskPanelFacts {
  const DiskPanelFacts({
    required this.reading,
    required this.freeableBytes,
    required this.isFreeableComplete,
    required this.ringCaption,
    required this.overline,
    required this.headline,
    required this.lines,
  });

  final DiskRingReading reading;
  final int freeableBytes;

  /// False when [freeableBytes] is a lower bound.
  final bool isFreeableComplete;
  final String ringCaption;
  final String overline;
  final String headline;
  final List<String> lines;
}

DiskPanelFacts buildDiskPanelFacts(CleanerState state) {
  switch (state) {
    case ListedState(:final ScannedEvent scan):
      final SummaryView summary = scan.summary;
      final DiskSpaceView? disk = summary.disk;
      return DiskPanelFacts(
        reading: disk == null
            ? DiskRingFreeableReading(freeableBytes: summary.totalBytes)
            : DiskRingVolumeReading(
                capacityBytes: disk.capacityBytes,
                availableBytes: disk.availableBytes,
                freeableBytes: summary.totalBytes,
              ),
        freeableBytes: summary.totalBytes,
        isFreeableComplete: summary.isTotalComplete,
        ringCaption: 'can be freed',
        overline: 'This Mac',
        headline: '${formatSizeText(allocatedBytes: summary.totalBytes, isComplete: summary.isTotalComplete)} can be freed',
        lines: [
          if (disk != null)
            '${formatBytes(disk.availableBytes)} available of ${formatBytes(disk.capacityBytes)}',
          if (summary.safeBytes > 0)
            '${_formatSafeSizeText(summary)} of it is safe to remove at once'
          else
            'Nothing is safe to remove at once; review each section.',
        ],
      );
    case ScanningState():
      final List<SectionTotal> foundTotals = listShownSectionTotals(state);
      final int foundBytes = foundTotals.fold(
        0,
        (int sum, SectionTotal total) => sum + total.removableBytes,
      );
      return DiskPanelFacts(
        reading: DiskRingFreeableReading(freeableBytes: foundBytes),
        freeableBytes: foundBytes,
        isFreeableComplete: foundTotals.every((SectionTotal total) => total.isRemovableComplete),
        ringCaption: 'found so far',
        overline: 'Scanning',
        headline: '${formatScanPhaseText(state)}…',
        lines: const ['Each place lands in its section as the scan finds it.'],
      );
    case IdleState() || DeletingState() || DeletedState():
      return const DiskPanelFacts(
        reading: DiskRingFreeableReading(freeableBytes: 0),
        freeableBytes: 0,
        isFreeableComplete: true,
        ringCaption: 'nothing scanned',
        overline: 'This Mac',
        headline: 'Not scanned yet',
        lines: ['Scan again to find what takes space.'],
      );
  }
}

String _formatSafeSizeText(SummaryView summary) {
  return formatSizeText(allocatedBytes: summary.safeBytes, isComplete: summary.isSafeComplete);
}

/// The Overview's lead: the disk ring lit by what can be freed, the words on
/// it, and "Clean safe items".
class DiskPanel extends StatelessWidget {
  const DiskPanel({
    super.key,
    required this.controller,
    required this.onCleanSafeItems,
  });

  final CleanerController controller;

  /// What "Clean safe items" does once the scan holds safe items.
  final VoidCallback onCleanSafeItems;

  @override
  Widget build(BuildContext context) {
    final CleanerState state = controller.state;
    final DiskPanelFacts facts = buildDiskPanelFacts(state);
    final ScannedEvent? scan = findListedScan(state);
    final bool canCleanSafeItems =
        state is ScannedState &&
        state.scan.safeNumbers.isNotEmpty &&
        state.scan.summary.safeBytes > 0;
    final String cleanLabel = scan == null
        ? 'Clean safe items'
        : 'Clean safe items · ${_formatSafeSizeText(scan.summary)}';
    return GlassCard(
      accent: StageColors.overviewAccent,
      padding: const EdgeInsets.all(StageSpacing.extraLarge),
      child: Row(
        children: [
          SizedBox.square(
            dimension: _ringSide,
            child: DiskRing(
              reading: facts.reading,
              accent: StageColors.overviewAccent,
              isScanning: state is ScanningState,
              semanticsLabel: [facts.headline, ...facts.lines].join('. '),
              center: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CountUp(
                    value: facts.freeableBytes,
                    format: (int allocatedBytes) => formatSizeText(
                      allocatedBytes: allocatedBytes,
                      isComplete: facts.isFreeableComplete,
                    ),
                    style: TypeRamp.display.copyWith(fontSize: 40),
                  ),
                  Text(facts.ringCaption, style: TypeRamp.caption),
                ],
              ),
            ),
          ),
          const SizedBox(width: StageSpacing.extraLarge + 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(facts.overline.toUpperCase(), style: TypeRamp.overline),
                const SizedBox(height: StageSpacing.small),
                Text(facts.headline, style: TypeRamp.headline),
                const SizedBox(height: StageSpacing.small),
                for (final String line in facts.lines)
                  Padding(
                    padding: const EdgeInsets.only(bottom: StageSpacing.tight),
                    child: Text(line, style: TypeRamp.body),
                  ),
                const SizedBox(height: StageSpacing.regular),
                const _DiskLegend(),
                const SizedBox(height: StageSpacing.large),
                StageButton(
                  label: cleanLabel,
                  icon: AppIcons.cleanSafeItems,
                  tone: StageButtonTone.primary,
                  accent: StageColors.safe,
                  onPressed: canCleanSafeItems ? onCleanSafeItems : null,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DiskLegend extends StatelessWidget {
  const _DiskLegend();

  @override
  Widget build(BuildContext context) {
    return const Wrap(
      spacing: StageSpacing.regular,
      runSpacing: StageSpacing.small,
      children: [
        _DiskLegendEntry(color: StageColors.diskUsed, label: 'Used'),
        _DiskLegendEntry(color: StageColors.overviewAccent, label: 'Can be freed'),
        _DiskLegendEntry(color: StageColors.diskAvailable, label: 'Available'),
      ],
    );
  }
}

class _DiskLegendEntry extends StatelessWidget {
  const _DiskLegendEntry({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color,
            border: Border.all(color: GlassTokens.rimLight),
          ),
        ),
        const SizedBox(width: 6),
        Text(label, style: TypeRamp.caption),
      ],
    );
  }
}
