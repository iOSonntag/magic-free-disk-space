import '../bridge/bridge_event.dart';

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

/// Every selectable item of [scan]: those of its sections, their check
/// groups, and Explore.
List<ItemView> listScanItems(ScannedEvent scan) {
  return [
    for (final SectionView section in scan.sections) ...[
      ...section.items,
      ...?section.checkGroup?.items,
    ],
    ...?scan.explore?.items,
  ];
}

ShownItemGroup getShownItemGroup(ItemGroup group) {
  return switch (group) {
    ItemGroup.safe => ShownItemGroup.safe,
    ItemGroup.careful => ShownItemGroup.careful,
    ItemGroup.review || ItemGroup.unknown => ShownItemGroup.review,
  };
}

SectionContents buildSectionContents(ScannedEvent scan, SectionKey sectionKey) {
  final Map<ShownItemGroup, List<ItemView>> itemsByGroup = {
    for (final ShownItemGroup group in ShownItemGroup.values) group: [],
  };
  for (final ItemView item in listScanItems(scan)) {
    if (item.sectionKey == sectionKey) {
      itemsByGroup[getShownItemGroup(item.group)]!.add(item);
    }
  }
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
    for (final ItemView item in listScanItems(scan))
      if (numbers.contains(item.number)) item,
  ];
}

/// The size of [items] together, and whether every one of them was measured
/// whole.
({int allocatedBytes, bool isComplete}) sumItemSizes(List<ItemView> items) {
  int allocatedBytes = 0;
  bool isComplete = true;
  for (final ItemView item in items) {
    allocatedBytes += item.allocatedBytes;
    isComplete = isComplete && item.isComplete;
  }
  return (allocatedBytes: allocatedBytes, isComplete: isComplete);
}
