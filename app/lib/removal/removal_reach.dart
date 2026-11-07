import '../bridge/bridge.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';

/// Planned items split by what their removal leaves behind: gone for good,
/// or still in iCloud, from where they download again.
final class RemovalReach {
  const RemovalReach._({required this.finalItems, required this.evictedItems});

  /// Splits [items] in their own order.
  factory RemovalReach.split(Iterable<PlannedItemView> items) {
    return RemovalReach._(
      finalItems: [
        for (final PlannedItemView item in items)
          if (_isRemovalFinal(item.removal)) item,
      ],
      evictedItems: [
        for (final PlannedItemView item in items)
          if (!_isRemovalFinal(item.removal)) item,
      ],
    );
  }

  /// The items that skip the Trash and cannot come back.
  final List<PlannedItemView> finalItems;

  /// The items that leave this Mac only and stay in iCloud.
  final List<PlannedItemView> evictedItems;

  ItemSizeSum get finalSize => sumPlannedItemSizes(finalItems);

  ItemSizeSum get evictedSize => sumPlannedItemSizes(evictedItems);
}

/// The size of some planned items together, as [sumItemSizes] sums a scan's.
ItemSizeSum sumPlannedItemSizes(Iterable<PlannedItemView> items) {
  int allocatedBytes = 0;
  bool isComplete = true;
  for (final PlannedItemView item in items) {
    allocatedBytes += item.allocatedBytes;
    isComplete = isComplete && item.isComplete;
  }
  return ItemSizeSum(allocatedBytes: allocatedBytes, isComplete: isComplete);
}

/// The plan's total, "at least" when an item of it was not measured whole.
String formatPlanTotalText(PlannedEvent plan) {
  return formatSizeText(
    allocatedBytes: plan.totalBytes,
    isComplete: sumPlannedItemSizes(plan.items).isComplete,
  );
}

/// The size of one planned item as the delete flow lists it.
String formatPlannedItemSizeText(PlannedItemView item) {
  return formatSizeText(allocatedBytes: item.allocatedBytes, isComplete: item.isComplete);
}

/// "5.0 MB stays in iCloud…", for the [evictedSize] an evict frees on this
/// Mac.
String formatStaysInIcloudText(ItemSizeSum evictedSize) {
  return '${formatItemSizeSumText(evictedSize)} stays in iCloud and downloads again when opened.';
}

/// Whether an item removed the way [removal] says is gone for good: every
/// removal but an evict, whose item stays in iCloud and downloads again.
bool _isRemovalFinal(ItemRemoval removal) {
  return switch (removal) {
    ItemRemoval.evict => false,
    ItemRemoval.delete ||
    ItemRemoval.tool ||
    ItemRemoval.engine ||
    ItemRemoval.advice ||
    ItemRemoval.unknown => true,
  };
}
