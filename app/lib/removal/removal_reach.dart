import '../bridge/bridge.dart';
import '../design/design.dart';

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

  int get finalBytes => _sumAllocatedBytes(finalItems);

  int get evictedBytes => _sumAllocatedBytes(evictedItems);
}

/// "5.0 MB stays in iCloud…", for the [evictedBytes] an evict frees on this
/// Mac.
String formatStaysInIcloudText(int evictedBytes) {
  return '${formatBytes(evictedBytes)} stays in iCloud and downloads again when opened.';
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

int _sumAllocatedBytes(List<PlannedItemView> items) {
  return items.fold(0, (int sum, PlannedItemView item) => sum + item.allocatedBytes);
}
