import '../bridge/bridge.dart';

/// The biggest of some planned items, biggest first, and how many of them
/// these leave out.
final class BiggestItems {
  const BiggestItems({required this.shownItems, required this.moreCount});

  final List<PlannedItemView> shownItems;
  final int moreCount;
}

/// The [shownCount] biggest of [items], biggest first, and the count of the
/// rest.
BiggestItems buildBiggestItems(
  Iterable<PlannedItemView> items, {
  required int shownCount,
}) {
  final List<PlannedItemView> biggestFirst = [...items]
    ..sort(
      (PlannedItemView left, PlannedItemView right) =>
          right.allocatedBytes.compareTo(left.allocatedBytes),
    );
  final List<PlannedItemView> shownItems = biggestFirst.take(shownCount).toList();
  return BiggestItems(
    shownItems: shownItems,
    moreCount: biggestFirst.length - shownItems.length,
  );
}
