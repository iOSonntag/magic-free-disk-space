import '../bridge/bridge.dart';

/// The group a section page shows an item under. An item of a group this app
/// does not know shows under [review], which is never ticked for anyone.
enum ShownItemGroup { safe, review, careful }

/// What one section holds in a scan, wherever the bridge listed it: its
/// selectable items by group, and its advice.
class SectionContents {
  const SectionContents({
    required this.itemsByGroup,
    required this.adviceItems,
  });

  final Map<ShownItemGroup, List<ItemView>> itemsByGroup;
  final List<AdviceItemView> adviceItems;

  bool get isEmpty {
    return adviceItems.isEmpty &&
        itemsByGroup.values.every((List<ItemView> items) => items.isEmpty);
  }

  List<ItemView> getGroupItems(ShownItemGroup group) {
    return itemsByGroup[group] ?? const [];
  }
}

ShownItemGroup itemGroupToShownItemGroup(ItemGroup group) {
  return switch (group) {
    ItemGroup.safe => ShownItemGroup.safe,
    ItemGroup.careful => ShownItemGroup.careful,
    ItemGroup.review || ItemGroup.unknown => ShownItemGroup.review,
  };
}

/// False for an item of [Risk.never], which the bridge refuses to plan.
bool isItemRemovable(ItemView item) {
  return switch (item.risk) {
    Risk.safe || Risk.review || Risk.careful => true,
    Risk.never => false,
  };
}

SectionContents buildSectionContents(ScannedEvent scan, SectionKey sectionKey) {
  final List<ItemView> sectionItems = [
    for (final ItemView item in scan.selectableItems)
      if (item.sectionKey == sectionKey) item,
  ];
  final Map<ShownItemGroup, List<ItemView>> itemsByGroup = {
    for (final ShownItemGroup group in ShownItemGroup.values)
      group: [
        for (final ItemView item in sectionItems)
          if (itemGroupToShownItemGroup(item.group) == group) item,
      ],
  };
  final List<AdviceItemView> adviceItems = [
    for (final AdviceItemView item
        in scan.explore?.adviceGroup?.items ?? const <AdviceItemView>[])
      if (item.sectionKey == sectionKey) item,
  ];
  return SectionContents(itemsByGroup: itemsByGroup, adviceItems: adviceItems);
}

/// The items of [scan] that [numbers] name.
List<ItemView> listSelectedItems(ScannedEvent scan, Set<int> numbers) {
  return [
    for (final ItemView item in scan.selectableItems)
      if (numbers.contains(item.number)) item,
  ];
}

/// The size of some items together.
final class ItemSizeSum {
  const ItemSizeSum({required this.allocatedBytes, required this.isComplete});

  final int allocatedBytes;

  /// Whether every one of the items was measured whole.
  final bool isComplete;
}

ItemSizeSum sumItemSizes(Iterable<ItemView> items) {
  int allocatedBytes = 0;
  bool isComplete = true;
  for (final ItemView item in items) {
    allocatedBytes += item.allocatedBytes;
    isComplete = isComplete && item.isComplete;
  }
  return ItemSizeSum(allocatedBytes: allocatedBytes, isComplete: isComplete);
}
