import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/app_icons.dart';
import '../design/count_up.dart';
import '../design/disk_ring/disk_ring.dart';
import '../design/disk_ring/disk_ring_arcs.dart';
import '../design/format_bytes.dart';
import '../design/glass_card.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../removal/delete_confirm_alert.dart';
import '../section/section_totals.dart';
import '../shell/scan_phase_text.dart';
import '../shell/stage_button.dart';

const double _ringSide = 248;

/// "Clean safe items": selects the safe items, asks the bridge for their
/// plan, and opens the short alert on it. "Show list" in the alert leaves
/// the plan for the Review page behind it. The alert opens from the root
/// navigator, which outlives the page that asked once the shell shows
/// Review.
Future<void> cleanSafeItems(
  BuildContext context,
  CleanerController controller,
) async {
  final NavigatorState rootNavigator = Navigator.of(context, rootNavigator: true);
  controller.selectSafeCandidates();
  await controller.requestPlan();
  if (!rootNavigator.mounted) {
    return;
  }
  final CleanerState state = controller.state;
  if (state is! ConfirmingState) {
    return;
  }
  await showDeleteConfirmAlert(
    context: rootNavigator.context,
    controller: controller,
    state: state,
    canShowList: true,
  );
}

/// What the Overview's ring and its words show for one state.
typedef DiskPanelFacts = ({
  DiskRingReading reading,
  int freeableBytes,
  String ringCaption,
  String overline,
  String headline,
  List<String> lines,
});

DiskPanelFacts buildDiskPanelFacts(CleanerState state) {
  switch (state) {
    case ListedState(:final ScannedEvent scan):
      final SummaryView summary = scan.summary;
      final DiskSpaceView? disk = summary.disk;
      return (
        reading: disk == null
            ? DiskRingFreeableReading(freeableBytes: summary.totalBytes)
            : DiskRingVolumeReading(
                capacityBytes: disk.capacityBytes,
                availableBytes: disk.availableBytes,
                freeableBytes: summary.totalBytes,
              ),
        freeableBytes: summary.totalBytes,
        ringCaption: 'can be freed',
        overline: 'This Mac',
        headline: '${formatBytes(summary.totalBytes)} can be freed',
        lines: [
          if (disk != null)
            '${formatBytes(disk.availableBytes)} available of ${formatBytes(disk.capacityBytes)}',
          if (summary.safeBytes > 0)
            '${formatBytes(summary.safeBytes)} of it is safe to remove at once'
          else
            'Nothing is safe to remove at once; review each section.',
        ],
      );
    case ScanningState():
      final int foundBytes = listShownSectionTotals(state).fold(
        0,
        (int sum, SectionTotal total) => sum + total.allocatedBytes,
      );
      return (
        reading: DiskRingFreeableReading(freeableBytes: foundBytes),
        freeableBytes: foundBytes,
        ringCaption: 'found so far',
        overline: 'Scanning',
        headline: '${formatScanPhaseText(state)}…',
        lines: const ['Each place lands in its section as the scan finds it.'],
      );
    case IdleState() || DeletingState() || DeletedState():
      return (
        reading: const DiskRingFreeableReading(freeableBytes: 0),
        freeableBytes: 0,
        ringCaption: 'nothing scanned',
        overline: 'This Mac',
        headline: 'Not scanned yet',
        lines: const ['Scan again to find what takes space.'],
      );
  }
}

/// The Overview's lead: the disk ring lit by what can be freed, the words on
/// it, and "Clean safe items".
class DiskPanel extends StatelessWidget {
  const DiskPanel({super.key, required this.controller});

  final CleanerController controller;

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
        : 'Clean safe items · ${formatBytes(scan.summary.safeBytes)}';
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
                    format: formatBytes,
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
                  onPressed: canCleanSafeItems
                      ? () => cleanSafeItems(context, controller)
                      : null,
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
