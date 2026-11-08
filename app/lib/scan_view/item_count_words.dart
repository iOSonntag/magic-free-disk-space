/// "1 item" or "[count] items".
String formatItemCount(int count) {
  return count == 1 ? '1 item' : '$count items';
}

/// "1 place" or "[count] places", for advice, which names places rather than
/// items to remove.
String formatPlaceCount(int count) {
  return count == 1 ? '1 place' : '$count places';
}

/// "and 1 more item" or "and [count] more items", after a list that names
/// only some.
String formatMoreItems(int count) {
  return count == 1 ? 'and 1 more item' : 'and $count more items';
}
