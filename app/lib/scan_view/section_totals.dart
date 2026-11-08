import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import 'item_count_words.dart';

/// The scan of [state], or `null` while no scan is listed.
ScannedEvent? findListedScan(CleanerState state) {
  return switch (state) {
    ListedState() => state.scan,
    IdleState() || ScanningState() || DeletingState() || DeletedState() => null,
  };
}

/// The section totals to show for [state]: the scan's, or what the scan found
/// so far while it runs; one per key, in the bridge's order.
List<SectionTotal> listShownSectionTotals(CleanerState state) {
  final List<SectionTotal> totals = switch (state) {
    ListedState() => state.scan.sectionTotals,
    ScanningState(:final ProgressEvent? progress) => progress?.found ?? const [],
    IdleState() || DeletingState() || DeletedState() => const [],
  };
  return mergeSectionTotalsByKey(totals);
}

/// Joins the totals that share a key, as the sections of two keys this app
/// does not know share [SectionKey.unknown], each at the place the bridge
/// first sent its key.
List<SectionTotal> mergeSectionTotalsByKey(List<SectionTotal> totals) {
  // A map literal keeps its keys in the order they were first added.
  final Map<SectionKey, SectionTotal> totalsByKey = {};
  for (final SectionTotal total in totals) {
    final SectionTotal? earlier = totalsByKey[total.sectionKey];
    totalsByKey[total.sectionKey] = earlier == null
        ? total
        : SectionTotal(
            sectionKey: total.sectionKey,
            titleText: earlier.titleText == total.titleText
                ? earlier.titleText
                : '${earlier.titleText} and ${total.titleText}',
            allocatedBytes: earlier.allocatedBytes + total.allocatedBytes,
            isComplete: earlier.isComplete && total.isComplete,
            removableBytes: earlier.removableBytes + total.removableBytes,
            isRemovableComplete: earlier.isRemovableComplete && total.isRemovableComplete,
            itemCount: earlier.itemCount + total.itemCount,
            safeBytes: earlier.safeBytes + total.safeBytes,
            adviceCount: earlier.adviceCount + total.adviceCount,
          );
  }
  return totalsByKey.values.toList();
}

/// The total of [sectionKey] among [totals], or `null` when it holds nothing.
SectionTotal? findSectionTotal(List<SectionTotal> totals, SectionKey sectionKey) {
  for (final SectionTotal total in totals) {
    if (total.sectionKey == sectionKey) {
      return total;
    }
  }
  return null;
}

/// The one figure a section shows by its title: its size, or for a section
/// of advice alone, whose size no scan measures, how many places it names.
String formatSectionFigureText(SectionTotal total) {
  return total.itemCount > 0
      ? formatSizeText(allocatedBytes: total.allocatedBytes, isComplete: total.isComplete)
      : formatPlaceCount(total.adviceCount);
}

/// "2 items", with what only the user can remove after it.
String formatSectionCountText(SectionTotal total) {
  final List<String> parts = [
    if (total.itemCount > 0) formatItemCount(total.itemCount),
    if (total.adviceCount > 0)
      '${total.adviceCount} to handle yourself',
  ];
  if (parts.isEmpty) {
    return 'Nothing found';
  }
  return parts.join(' · ');
}
