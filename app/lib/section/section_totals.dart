import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../removal/item_count_words.dart';

/// The scan of [state], or `null` while no scan is listed.
ScannedEvent? findListedScan(CleanerState state) {
  return switch (state) {
    ListedState() => state.scan,
    _ => null,
  };
}

/// The section totals to show for [state]: the scan's, or what the scan found
/// so far while it runs; one per key, in the order of [SectionKey].
List<SectionTotal> listShownSectionTotals(CleanerState state) {
  final List<SectionTotal> totals = switch (state) {
    ListedState() => state.scan.sectionTotals,
    ScanningState(:final ProgressEvent? progress) => progress?.found ?? const [],
    IdleState() || DeletingState() || DeletedState() => const [],
  };
  return mergeSectionTotalsByKey(totals);
}

/// Joins the totals that share a key, as the sections of two keys this app
/// does not know share [SectionKey.unknown], and orders them by
/// [SectionKey], so a section keeps its place while a scan finds more.
List<SectionTotal> mergeSectionTotalsByKey(List<SectionTotal> totals) {
  final Map<SectionKey, SectionTotal> totalsByKey = {};
  for (final SectionTotal total in totals) {
    final SectionTotal? earlier = totalsByKey[total.sectionKey];
    totalsByKey[total.sectionKey] = earlier == null
        ? total
        : SectionTotal(
            sectionKey: total.sectionKey,
            allocatedBytes: earlier.allocatedBytes + total.allocatedBytes,
            itemCount: earlier.itemCount + total.itemCount,
            safeBytes: earlier.safeBytes + total.safeBytes,
            adviceCount: earlier.adviceCount + total.adviceCount,
          );
  }
  return [
    for (final SectionKey sectionKey in SectionKey.values)
      ?totalsByKey[sectionKey],
  ];
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
