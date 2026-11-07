import 'package:magic_free_disk_space/bridge/bridge.dart';

/// A selectable item of a test at a made-up path named after [title]; what a
/// test does not name is that of a plain catalog item, measured whole.
ItemView buildTestItemView({
  required int number,
  required String title,
  required Risk risk,
  required ItemGroup group,
  required SectionKey sectionKey,
  required int allocatedBytes,
  ItemOrigin origin = ItemOrigin.catalog,
  ItemRemoval removal = ItemRemoval.delete,
}) {
  final String path = '/Users/me/Test/$title';
  return ItemView(
    number: number,
    key: 'test:$path',
    title: title,
    risk: risk,
    detailLines: [ItemDetailLine(kind: ItemDetailLineKind.path, text: path)],
    sectionKey: sectionKey,
    group: group,
    origin: origin,
    removal: removal,
    allocatedBytes: allocatedBytes,
    isComplete: true,
    displayPath: '~/Test/$title',
    revealPath: path,
    lastUsedAt: null,
    downloadedAt: null,
    appName: null,
    matchedBy: null,
  );
}

/// The numbers of [items], in their order.
List<int> getItemNumbers(List<ItemView> items) {
  return [for (final ItemView item in items) item.number];
}

/// [item] as a plan of the bridge lists it.
PlannedItemView planItem(ItemView item) {
  return PlannedItemView(
    number: item.number,
    key: item.key,
    title: item.title,
    sectionKey: item.sectionKey,
    group: item.group,
    risk: item.risk,
    removal: item.removal,
    allocatedBytes: item.allocatedBytes,
    isComplete: item.isComplete,
  );
}

/// The plan of [items] as the bridge answers it: a line per item, and their
/// sizes summed into its total.
PlannedEvent buildSamplePlan(
  List<PlannedItemView> items, {
  int planId = 1,
  required bool holdsCareful,
}) {
  return PlannedEvent(
    planId: planId,
    lines: [for (final PlannedItemView item in items) '- ${item.title}'],
    items: items,
    totalBytes: items.fold(0, (int sum, PlannedItemView item) => sum + item.allocatedBytes),
    holdsCareful: holdsCareful,
  );
}
