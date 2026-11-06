/// "1 item" or "[count] items".
String formatItemCount(int count) {
  return count == 1 ? '1 item' : '$count items';
}

/// "and 1 more item" or "and [count] more items", after a list that names
/// only some.
String formatMoreItems(int count) {
  return count == 1 ? 'and 1 more item' : 'and $count more items';
}
