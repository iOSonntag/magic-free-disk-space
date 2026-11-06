import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../design/app_icons.dart';
import '../design/tokens.dart';
import 'section_contents.dart';

String formatGroupTitle(ShownItemGroup group) {
  return switch (group) {
    ShownItemGroup.safe => 'Safe to remove',
    ShownItemGroup.review => 'Review first',
    ShownItemGroup.careful => "Can't be undone",
  };
}

/// One line on what the group means for the selection.
String formatGroupHint(ShownItemGroup group) {
  return switch (group) {
    ShownItemGroup.safe => 'Clean safe items picks these. They come back on their own.',
    ShownItemGroup.review => 'Never ticked for you. Read what each one is first.',
    ShownItemGroup.careful => 'Never ticked for you. Nothing brings these back.',
  };
}

IconData getGroupGlyph(ShownItemGroup group) {
  return switch (group) {
    ShownItemGroup.safe => AppIcons.safeGroup,
    ShownItemGroup.review => AppIcons.reviewGroup,
    ShownItemGroup.careful => AppIcons.carefulGroup,
  };
}

Color getGroupTone(ShownItemGroup group) {
  return switch (group) {
    ShownItemGroup.safe => StageColors.safe,
    ShownItemGroup.review => StageColors.review,
    ShownItemGroup.careful => StageColors.careful,
  };
}

/// The glyph of an item's row: what found it, or [sectionGlyph] for an item
/// of the section's own places.
IconData getItemGlyph(ItemOrigin origin, {required IconData sectionGlyph}) {
  return switch (origin) {
    ItemOrigin.project => AppIcons.projects,
    ItemOrigin.largeFile => AppIcons.largeFiles,
    ItemOrigin.leftover || ItemOrigin.app => AppIcons.apps,
    ItemOrigin.trash => AppIcons.trash,
    ItemOrigin.catalog || ItemOrigin.explore || ItemOrigin.unknown =>
      sectionGlyph,
  };
}

/// How the item goes when deleted, or `null` for a removal this app does not
/// know.
String? formatRemovalText(ItemRemoval removal) {
  return switch (removal) {
    ItemRemoval.delete => 'Deleted for good: it does not go to the Trash.',
    ItemRemoval.tool => 'Its own tool removes it, the way the tool itself would.',
    ItemRemoval.engine => 'Its engine removes it; the disk image gives the space back within minutes.',
    ItemRemoval.evict => 'Removed from this Mac only: it stays in iCloud and downloads again when opened.',
    ItemRemoval.advice => 'Only you can remove it, in its own app.',
    ItemRemoval.unknown => null,
  };
}

/// The short note a row shows for a removal other than a plain delete.
String? formatRemovalNote(ItemRemoval removal) {
  return switch (removal) {
    ItemRemoval.tool => 'Removed by its own tool',
    ItemRemoval.engine => 'Removed through its engine',
    ItemRemoval.evict => 'Stays in iCloud',
    ItemRemoval.delete || ItemRemoval.advice || ItemRemoval.unknown => null,
  };
}

/// "Last used 3 months ago", counted in whole days back from [now].
String formatLastUsedText(DateTime lastUsedAt, {required DateTime now}) {
  return 'Last used ${_formatAgeText(lastUsedAt, now: now)}';
}

String formatDownloadedText(DateTime downloadedAt, {required DateTime now}) {
  return 'Downloaded ${_formatAgeText(downloadedAt, now: now)}';
}

String _formatAgeText(DateTime moment, {required DateTime now}) {
  final int days = now.difference(moment).inDays;
  if (days < 1) {
    return 'today';
  }
  if (days == 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return '$days days ago';
  }
  if (days < 365) {
    final int months = days ~/ 30;
    return months == 1 ? 'a month ago' : '$months months ago';
  }
  final int years = days ~/ 365;
  return years == 1 ? 'a year ago' : '$years years ago';
}

/// The facts a row shows under its title: its app, its last use, how it goes
/// and a name match, joined by dots; empty when it has none.
String formatItemFactsText(ItemView item, {required DateTime now}) {
  final DateTime? lastUsedAt = item.lastUsedAt;
  final DateTime? downloadedAt = item.downloadedAt;
  final List<String> facts = [
    ?item.appName,
    if (lastUsedAt != null)
      formatLastUsedText(lastUsedAt, now: now)
    else if (downloadedAt != null)
      formatDownloadedText(downloadedAt, now: now),
    ?formatRemovalNote(item.removal),
    if (item.matchedBy == LeftoverMatch.name) 'Matched by name',
  ];
  return facts.join(' · ');
}
