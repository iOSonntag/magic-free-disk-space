import 'openable_url.dart';

/// Picks the colour of an item; its `riskText` is what shows.
enum Risk { safe, review, careful, never }

enum ItemDetailLineKind {
  path,
  explanation,
  regeneration,
  evidence,
  command,
  advice,
}

/// Whether macOS lets the bridge into the folders that privacy protection
/// guards.
enum FullDiskAccess { granted, denied, unknown }

/// The section an item belongs to, Explore's items included; [unknown] stands
/// for a section of a newer bridge, shown by the bridge's title.
///
/// The members stand in the order the app shows the sections in, the order
/// the bridge sends them in, with [unknown] last.
enum SectionKey {
  caches,
  developerTools,
  projects,
  containers,
  aiModels,
  apps,
  downloads,
  largeFiles,
  icloud,
  trash,
  ownApp,
  unknown,
}

/// The group of its section an item shows in: [safe] items a rule alone
/// vouches for, [careful] items nothing brings back, [review] every other
/// item, a safe item a probe found among them.
enum ItemGroup { safe, review, careful, unknown }

/// The source that found an item.
enum ItemOrigin {
  catalog,
  explore,
  project,
  largeFile,
  leftover,
  app,
  trash,
  unknown,
}

/// How an item goes: [delete]d as its path or its folder, by its own [tool],
/// by its container [engine], [evict]ed to iCloud, or by hand, as [advice].
enum ItemRemoval { delete, tool, engine, evict, advice, unknown }

/// How data was tied to the app it stayed behind from.
enum LeftoverMatch { bundleId, name, unknown }

/// The step a scan is at.
enum ScanPhase {
  apps,
  catalog,
  projects,
  largeFiles,
  leftovers,
  tools,
  unknown,
}

/// How an item of a run ended.
enum DeletedOutcome { removed, partlyRemoved, kept, failed, unknown }

/// Why an item of a run ended as it did, when it was not simply removed.
enum DeletedReason {
  alreadyGone,
  changedSinceScan,
  ownerRunning,
  notAttempted,
  permissionDenied,
  failed,
  toolFailed,
  engineInUse,
  engineNotRunning,
  unknown,
}

final class ItemDetailLine {
  const ItemDetailLine({required this.kind, required this.text});

  final ItemDetailLineKind kind;
  final String text;
}

/// A selectable item; [number] is what the selection names, [key] what names
/// it the same way in every scan.
final class ItemView {
  const ItemView({
    required this.number,
    required this.key,
    required this.title,
    required this.risk,
    required this.riskText,
    required this.sizeText,
    required this.detailLines,
    required this.sectionKey,
    required this.group,
    required this.origin,
    required this.removal,
    required this.allocatedBytes,
    required this.isComplete,
    required this.displayPath,
    required this.revealPath,
    required this.lastUsedAt,
    required this.downloadedAt,
    required this.appName,
    required this.matchedBy,
  });

  final int number;
  final String key;
  final String title;
  final Risk risk;
  final String riskText;
  final String sizeText;
  final List<ItemDetailLine> detailLines;
  final SectionKey sectionKey;
  final ItemGroup group;
  final ItemOrigin origin;
  final ItemRemoval removal;
  final int allocatedBytes;

  /// False when [allocatedBytes] is a lower bound.
  final bool isComplete;

  /// The path as it shows, `~` for the home folder.
  final String? displayPath;

  /// The path Finder shows; `null` for an item with no path of its own.
  final String? revealPath;
  final DateTime? lastUsedAt;
  final DateTime? downloadedAt;
  final String? appName;

  /// Set only for a leftover.
  final LeftoverMatch? matchedBy;
}

/// What opens the place an advice item is handled in.
sealed class AdviceOpener {
  const AdviceOpener();
}

final class AppOpener extends AdviceOpener {
  const AppOpener({required this.app});

  final OpenableApp app;
}

final class SettingsOpener extends AdviceOpener {
  const SettingsOpener({required this.pane});

  final SettingsPane pane;
}

/// An item the tool never removes, so it has no number and no selection.
final class AdviceItemView {
  const AdviceItemView({
    required this.key,
    required this.title,
    required this.risk,
    required this.riskText,
    required this.sizeText,
    required this.detailLines,
    required this.sectionKey,
    required this.origin,
    required this.removal,
    required this.allocatedBytes,
    required this.displayPath,
    required this.revealPath,
    required this.opener,
  });

  final String key;
  final String title;
  final Risk risk;
  final String riskText;
  final String sizeText;
  final List<ItemDetailLine> detailLines;
  final SectionKey sectionKey;
  final ItemOrigin origin;

  /// [ItemRemoval.advice], from this bridge.
  final ItemRemoval removal;
  final int allocatedBytes;
  final String? displayPath;
  final String? revealPath;

  /// `null` when nothing opens its place, or its opener is of a newer bridge.
  final AdviceOpener? opener;
}

/// The volume of the home folder.
final class DiskSpaceView {
  const DiskSpaceView({
    required this.capacityBytes,
    required this.availableBytes,
  });

  final int capacityBytes;
  final int availableBytes;
}

final class SummaryView {
  const SummaryView({
    required this.titleText,
    required this.lines,
    required this.totalBytes,
    required this.safeBytes,
    required this.disk,
  });

  final String titleText;
  final List<String> lines;
  final int totalBytes;

  /// The bytes of the safe groups, which "Clean safe items" frees.
  final int safeBytes;

  /// `null` when the bridge could not read the volume.
  final DiskSpaceView? disk;
}

/// What one section holds, Explore's items of it included; advice counts
/// without its size, which its own tool frees.
final class SectionTotal {
  const SectionTotal({
    required this.sectionKey,
    required this.allocatedBytes,
    required this.itemCount,
    required this.safeBytes,
    required this.adviceCount,
  });

  final SectionKey sectionKey;
  final int allocatedBytes;
  final int itemCount;
  final int safeBytes;
  final int adviceCount;
}

final class SectionView {
  const SectionView({
    required this.key,
    required this.titleText,
    required this.sizeText,
    required this.isInitiallyExpanded,
    required this.items,
    required this.checkGroup,
  });

  final SectionKey key;
  final String titleText;
  final String sizeText;
  final bool isInitiallyExpanded;

  /// The safe items, shown open.
  final List<ItemView> items;
  final CheckGroupView? checkGroup;
}

/// The items of a section that are not safe, shown collapsed.
final class CheckGroupView {
  const CheckGroupView({required this.titleText, required this.items});

  final String titleText;
  final List<ItemView> items;
}

final class ExploreView {
  const ExploreView({
    required this.titleText,
    required this.introText,
    required this.items,
    required this.adviceGroup,
  });

  final String titleText;
  final String introText;
  final List<ItemView> items;
  final AdviceGroupView? adviceGroup;
}

final class AdviceGroupView {
  const AdviceGroupView({required this.titleText, required this.items});

  final String titleText;
  final List<AdviceItemView> items;
}

final class SkippedView {
  const SkippedView({required this.titleText, required this.lines});

  final String titleText;
  final List<String> lines;
}

/// A button that opens [url]; [failedText] shows when it did not open.
final class LinkView {
  const LinkView({
    required this.labelText,
    required this.url,
    required this.failedText,
  });

  final String labelText;
  final OpenableUrl url;
  final String failedText;
}

final class NoticeView {
  const NoticeView({
    required this.titleText,
    required this.lines,
    required this.settingsLink,
  });

  final String titleText;
  final List<String> lines;

  /// Opens a pane of System Settings.
  final LinkView? settingsLink;
}

/// A newer release than this build, with the link to its page.
final class UpdateNoticeView {
  const UpdateNoticeView({
    required this.titleText,
    required this.lines,
    required this.downloadLink,
  });

  final String titleText;
  final List<String> lines;

  /// Opens the release page on GitHub.
  final LinkView downloadLink;
}

/// An item a plan deletes.
final class PlannedItemView {
  const PlannedItemView({
    required this.number,
    required this.key,
    required this.title,
    required this.sectionKey,
    required this.risk,
    required this.removal,
    required this.allocatedBytes,
  });

  final int number;
  final String key;
  final String title;
  final SectionKey sectionKey;
  final Risk risk;

  /// How the run removes it, as the scan's item says.
  final ItemRemoval removal;
  final int allocatedBytes;
}

/// How one item of a run ended.
final class DeletedOutcomeView {
  const DeletedOutcomeView({
    required this.number,
    required this.key,
    required this.outcome,
    required this.reasonKey,
    required this.freedBytes,
  });

  final int number;
  final String key;
  final DeletedOutcome outcome;

  /// `null` for an item simply removed.
  final DeletedReason? reasonKey;
  final int freedBytes;
}

sealed class BridgeEvent {
  const BridgeEvent();
}

/// The final event that answers a scan request.
sealed class ScanAnswer implements BridgeEvent {}

/// The final event that answers a plan request.
sealed class PlanAnswer implements BridgeEvent {}

/// The final event that answers a delete request.
sealed class DeleteAnswer implements BridgeEvent {}

/// The final event that answers a status request.
sealed class StatusAnswer implements BridgeEvent {}

/// The final event that answers a check for updates.
sealed class UpdateCheckAnswer implements BridgeEvent {}

/// The final event that answers the change of the update check's preference.
sealed class UpdateCheckSetAnswer implements BridgeEvent {}

final class ProgressEvent extends BridgeEvent {
  const ProgressEvent({
    required this.message,
    required this.phase,
    required this.found,
  });

  final String message;
  final ScanPhase phase;

  /// The totals of the sections found so far.
  final List<SectionTotal> found;
}

/// A scan as the page shows it, top to bottom.
final class ScannedEvent extends BridgeEvent implements ScanAnswer {
  const ScannedEvent({
    required this.summary,
    required this.sections,
    required this.explore,
    required this.safeNumbers,
    required this.skipped,
    required this.notices,
    required this.sectionTotals,
  });

  final SummaryView summary;
  final List<SectionView> sections;
  final ExploreView? explore;

  /// The numbers "Select safe" picks.
  final List<int> safeNumbers;
  final SkippedView? skipped;
  final List<NoticeView> notices;

  /// Every section that holds an item or advice, top to bottom.
  final List<SectionTotal> sectionTotals;

  /// Every selectable item of this scan: those of its sections, their check
  /// groups, and Explore.
  List<ItemView> get selectableItems {
    return [
      for (final SectionView section in sections) ...[
        ...section.items,
        ...?section.checkGroup?.items,
      ],
      ...?explore?.items,
    ];
  }

  /// The paths of this scan that may be shown in Finder.
  Set<String> get revealPaths {
    return {
      for (final ItemView item in selectableItems) ?item.revealPath,
      for (final AdviceItemView item
          in explore?.adviceGroup?.items ?? <AdviceItemView>[])
        ?item.revealPath,
    };
  }
}

final class StatusEvent extends BridgeEvent implements StatusAnswer {
  const StatusEvent({required this.fullDiskAccess, required this.notices});

  final FullDiskAccess fullDiskAccess;

  /// The notices of the banner; empty when there is nothing to tell.
  final List<NoticeView> notices;
}

final class PlannedEvent extends BridgeEvent implements PlanAnswer {
  const PlannedEvent({
    required this.planId,
    required this.lines,
    required this.warningLines,
    required this.items,
    required this.totalBytes,
    required this.holdsCareful,
  });

  final int planId;
  final List<String> lines;
  final List<String> warningLines;
  final List<PlannedItemView> items;
  final int totalBytes;

  /// True when an item of the plan is careful: nothing brings it back.
  final bool holdsCareful;
}

final class NothingApprovedEvent extends BridgeEvent implements PlanAnswer {
  const NothingApprovedEvent({required this.lines});

  final List<String> lines;
}

final class DeletedEvent extends BridgeEvent implements DeleteAnswer {
  const DeletedEvent({
    required this.lines,
    required this.outcomes,
    required this.freedBytes,
    required this.returnsLaterBytes,
    required this.availableBytesAfter,
    required this.logPath,
  });

  final List<String> lines;
  final List<DeletedOutcomeView> outcomes;
  final int freedBytes;

  /// Space that comes back later, once a tool or the system gives it up.
  final int returnsLaterBytes;

  /// The space free on the volume after the run; `null` when it could not be
  /// read.
  final int? availableBytesAfter;

  /// The deletion log of the run, which may be shown in Finder.
  final String? logPath;
}

final class CancelledEvent extends BridgeEvent implements DeleteAnswer {
  const CancelledEvent({required this.message});

  final String message;
}

final class UpdateCheckedEvent extends BridgeEvent
    implements UpdateCheckAnswer {
  const UpdateCheckedEvent({
    required this.isUpdateCheckEnabled,
    required this.notice,
  });

  final bool isUpdateCheckEnabled;

  /// Set only when a newer release exists.
  final UpdateNoticeView? notice;
}

final class UpdateCheckSetEvent extends BridgeEvent
    implements UpdateCheckSetAnswer {
  const UpdateCheckSetEvent({required this.isUpdateCheckEnabled});

  final bool isUpdateCheckEnabled;
}

/// Also the answer of a bridge older than a request it does not know.
final class FailedEvent extends BridgeEvent
    implements
        ScanAnswer,
        PlanAnswer,
        DeleteAnswer,
        StatusAnswer,
        UpdateCheckAnswer,
        UpdateCheckSetAnswer {
  const FailedEvent({required this.message, required this.effect});

  final String message;
  final FailureEffect effect;
}

/// What a failure did to the bridge: after [scanDropped] the app must scan
/// again; after [bridgeStopping] the bridge exits, so the next request needs
/// a new one.
enum FailureEffect { scanKept, scanDropped, bridgeStopping }

/// Parses one decoded line of the bridge; throws [FormatException] on any
/// shape it does not know. A key of a newer bridge, such as a new section,
/// parses to the `unknown` member of its enum.
BridgeEvent parseBridgeEvent(Object? json) {
  return switch (json) {
    {
      'kind': 'progress',
      'message': final String message,
      'phase': final String phase,
      'found': final List<Object?> found,
    } =>
      ProgressEvent(
        message: message,
        phase: _parseKeyName(ScanPhase.values, phase, ScanPhase.unknown),
        found: found.map(_parseSectionTotal).toList(),
      ),
    {
      'kind': 'scanned',
      'summary': final Object? summary,
      'sections': final List<Object?> sections,
      'explore': final Object? explore,
      'safeNumbers': final List<Object?> safeNumbers,
      'skipped': final Object? skipped,
      'notices': final List<Object?> notices,
      'sectionTotals': final List<Object?> sectionTotals,
    } =>
      ScannedEvent(
        summary: _parseSummary(summary),
        sections: sections.map(_parseSection).toList(),
        explore: explore == null ? null : _parseExplore(explore),
        safeNumbers: _parseNumbers(safeNumbers),
        skipped: skipped == null ? null : _parseSkipped(skipped),
        notices: notices.map(_parseNotice).toList(),
        sectionTotals: sectionTotals.map(_parseSectionTotal).toList(),
      ),
    {
      'kind': 'status',
      'fullDiskAccess': final String fullDiskAccess,
      'notices': final List<Object?> notices,
    } =>
      StatusEvent(
        fullDiskAccess: _parseEnumName(FullDiskAccess.values, fullDiskAccess),
        notices: notices.map(_parseNotice).toList(),
      ),
    {
      'kind': 'planned',
      'planId': final int planId,
      'lines': final List<Object?> lines,
      'warningLines': final List<Object?> warningLines,
      'items': final List<Object?> items,
      'totalBytes': final int totalBytes,
      'holdsCareful': final bool holdsCareful,
    } =>
      PlannedEvent(
        planId: planId,
        lines: _parseLines(lines),
        warningLines: _parseLines(warningLines),
        items: items.map(_parsePlannedItem).toList(),
        totalBytes: totalBytes,
        holdsCareful: holdsCareful,
      ),
    {'kind': 'nothingApproved', 'lines': final List<Object?> lines} =>
      NothingApprovedEvent(lines: _parseLines(lines)),
    {
      'kind': 'deleted',
      'lines': final List<Object?> lines,
      'outcomes': final List<Object?> outcomes,
      'freedBytes': final int freedBytes,
      'returnsLaterBytes': final int returnsLaterBytes,
      'availableBytesAfter': final int? availableBytesAfter,
      'logPath': final String? logPath,
    } =>
      DeletedEvent(
        lines: _parseLines(lines),
        outcomes: outcomes.map(_parseDeletedOutcome).toList(),
        freedBytes: freedBytes,
        returnsLaterBytes: returnsLaterBytes,
        availableBytesAfter: availableBytesAfter,
        logPath: logPath,
      ),
    {'kind': 'cancelled', 'message': final String message} => CancelledEvent(
      message: message,
    ),
    {
      'kind': 'updateChecked',
      'isUpdateCheckEnabled': final bool isUpdateCheckEnabled,
      'notice': final Object? notice,
    } =>
      UpdateCheckedEvent(
        isUpdateCheckEnabled: isUpdateCheckEnabled,
        notice: notice == null ? null : _parseUpdateNotice(notice),
      ),
    {
      'kind': 'updateCheckSet',
      'isUpdateCheckEnabled': final bool isUpdateCheckEnabled,
    } =>
      UpdateCheckSetEvent(isUpdateCheckEnabled: isUpdateCheckEnabled),
    {
      'kind': 'failed',
      'message': final String message,
      'effect': final String effect,
    } =>
      FailedEvent(
        message: message,
        effect: _parseEnumName(FailureEffect.values, effect),
      ),
    {'kind': final String kind} => throw FormatException(
      'Unknown shape of the bridge event "$kind".',
    ),
    _ => throw const FormatException('A bridge line is not an event.'),
  };
}

SummaryView _parseSummary(Object? json) {
  return switch (json) {
    {
      'titleText': final String titleText,
      'lines': final List<Object?> lines,
      'totalBytes': final int totalBytes,
      'safeBytes': final int safeBytes,
      'disk': final Object? disk,
    } =>
      SummaryView(
        titleText: titleText,
        lines: _parseLines(lines),
        totalBytes: totalBytes,
        safeBytes: safeBytes,
        disk: disk == null ? null : _parseDiskSpace(disk),
      ),
    _ => throw const FormatException('Unknown shape of the summary.'),
  };
}

DiskSpaceView _parseDiskSpace(Object? json) {
  return switch (json) {
    {
      'capacityBytes': final int capacityBytes,
      'availableBytes': final int availableBytes,
    } =>
      DiskSpaceView(
        capacityBytes: capacityBytes,
        availableBytes: availableBytes,
      ),
    _ => throw const FormatException('Unknown shape of the disk space.'),
  };
}

SectionTotal _parseSectionTotal(Object? json) {
  return switch (json) {
    {
      'sectionKey': final String sectionKey,
      'allocatedBytes': final int allocatedBytes,
      'itemCount': final int itemCount,
      'safeBytes': final int safeBytes,
      'adviceCount': final int adviceCount,
    } =>
      SectionTotal(
        sectionKey: _parseSectionKey(sectionKey),
        allocatedBytes: allocatedBytes,
        itemCount: itemCount,
        safeBytes: safeBytes,
        adviceCount: adviceCount,
      ),
    _ => throw const FormatException('Unknown shape of a section total.'),
  };
}

SectionView _parseSection(Object? json) {
  return switch (json) {
    {
      'key': final String key,
      'titleText': final String titleText,
      'sizeText': final String sizeText,
      'isInitiallyExpanded': final bool isInitiallyExpanded,
      'items': final List<Object?> items,
      'checkGroup': final Object? checkGroup,
    } =>
      SectionView(
        key: _parseSectionKey(key),
        titleText: titleText,
        sizeText: sizeText,
        isInitiallyExpanded: isInitiallyExpanded,
        items: items.map(_parseItem).toList(),
        checkGroup: checkGroup == null ? null : _parseCheckGroup(checkGroup),
      ),
    _ => throw const FormatException('Unknown shape of a section.'),
  };
}

CheckGroupView _parseCheckGroup(Object? json) {
  return switch (json) {
    {'titleText': final String titleText, 'items': final List<Object?> items} =>
      CheckGroupView(
        titleText: titleText,
        items: items.map(_parseItem).toList(),
      ),
    _ => throw const FormatException('Unknown shape of a check group.'),
  };
}

ExploreView _parseExplore(Object? json) {
  return switch (json) {
    {
      'titleText': final String titleText,
      'introText': final String introText,
      'items': final List<Object?> items,
      'adviceGroup': final Object? adviceGroup,
    } =>
      ExploreView(
        titleText: titleText,
        introText: introText,
        items: items.map(_parseItem).toList(),
        adviceGroup: adviceGroup == null
            ? null
            : _parseAdviceGroup(adviceGroup),
      ),
    _ => throw const FormatException('Unknown shape of Explore.'),
  };
}

AdviceGroupView _parseAdviceGroup(Object? json) {
  return switch (json) {
    {'titleText': final String titleText, 'items': final List<Object?> items} =>
      AdviceGroupView(
        titleText: titleText,
        items: items.map(_parseAdviceItem).toList(),
      ),
    _ => throw const FormatException('Unknown shape of the advice group.'),
  };
}

ItemView _parseItem(Object? json) {
  return switch (json) {
    {
      'number': final int number,
      'key': final String key,
      'title': final String title,
      'risk': final String risk,
      'riskText': final String riskText,
      'sizeText': final String sizeText,
      'detailLines': final List<Object?> detailLines,
      'sectionKey': final String sectionKey,
      'group': final String group,
      'origin': final String origin,
      'removal': final String removal,
      'allocatedBytes': final int allocatedBytes,
      'isComplete': final bool isComplete,
      'displayPath': final String? displayPath,
      'revealPath': final String? revealPath,
      'lastUsedAt': final int? lastUsedAt,
      'downloadedAt': final int? downloadedAt,
      'appName': final String? appName,
      'matchedBy': final String? matchedBy,
    } =>
      ItemView(
        number: number,
        key: key,
        title: title,
        risk: _parseEnumName(Risk.values, risk),
        riskText: riskText,
        sizeText: sizeText,
        detailLines: detailLines.map(_parseDetailLine).toList(),
        sectionKey: _parseSectionKey(sectionKey),
        group: _parseKeyName(ItemGroup.values, group, ItemGroup.unknown),
        origin: _parseKeyName(ItemOrigin.values, origin, ItemOrigin.unknown),
        removal: _parseKeyName(
          ItemRemoval.values,
          removal,
          ItemRemoval.unknown,
        ),
        allocatedBytes: allocatedBytes,
        isComplete: isComplete,
        displayPath: displayPath,
        revealPath: revealPath,
        lastUsedAt: _parseInstant(lastUsedAt),
        downloadedAt: _parseInstant(downloadedAt),
        appName: appName,
        matchedBy: matchedBy == null
            ? null
            : _parseKeyName(
                LeftoverMatch.values,
                matchedBy,
                LeftoverMatch.unknown,
              ),
      ),
    _ => throw const FormatException('Unknown shape of an item.'),
  };
}

AdviceItemView _parseAdviceItem(Object? json) {
  return switch (json) {
    {
      'key': final String key,
      'title': final String title,
      'risk': final String risk,
      'riskText': final String riskText,
      'sizeText': final String sizeText,
      'detailLines': final List<Object?> detailLines,
      'sectionKey': final String sectionKey,
      'origin': final String origin,
      'removal': final String removal,
      'allocatedBytes': final int allocatedBytes,
      'displayPath': final String? displayPath,
      'revealPath': final String? revealPath,
      'opener': final Object? opener,
    } =>
      AdviceItemView(
        key: key,
        title: title,
        risk: _parseEnumName(Risk.values, risk),
        riskText: riskText,
        sizeText: sizeText,
        detailLines: detailLines.map(_parseDetailLine).toList(),
        sectionKey: _parseSectionKey(sectionKey),
        origin: _parseKeyName(ItemOrigin.values, origin, ItemOrigin.unknown),
        removal: _parseKeyName(
          ItemRemoval.values,
          removal,
          ItemRemoval.unknown,
        ),
        allocatedBytes: allocatedBytes,
        displayPath: displayPath,
        revealPath: revealPath,
        opener: _parseOpener(opener),
      ),
    _ => throw const FormatException('Unknown shape of an advice item.'),
  };
}

/// `null` for no opener and for an opener of a kind a newer bridge added.
AdviceOpener? _parseOpener(Object? json) {
  return switch (json) {
    null => null,
    {'kind': 'app', 'app': final String app} => AppOpener(
      app: _parseKeyName(OpenableApp.values, app, OpenableApp.unknown),
    ),
    {'kind': 'settings', 'pane': final String pane} => SettingsOpener(
      pane: _parseKeyName(SettingsPane.values, pane, SettingsPane.unknown),
    ),
    {'kind': 'app' || 'settings'} => throw const FormatException(
      'Unknown shape of an opener.',
    ),
    {'kind': String()} => null,
    _ => throw const FormatException('Unknown shape of an opener.'),
  };
}

PlannedItemView _parsePlannedItem(Object? json) {
  return switch (json) {
    {
      'number': final int number,
      'key': final String key,
      'title': final String title,
      'sectionKey': final String sectionKey,
      'risk': final String risk,
      'removal': final String removal,
      'allocatedBytes': final int allocatedBytes,
    } =>
      PlannedItemView(
        number: number,
        key: key,
        title: title,
        sectionKey: _parseSectionKey(sectionKey),
        risk: _parseEnumName(Risk.values, risk),
        removal: _parseKeyName(
          ItemRemoval.values,
          removal,
          ItemRemoval.unknown,
        ),
        allocatedBytes: allocatedBytes,
      ),
    _ => throw const FormatException('Unknown shape of a planned item.'),
  };
}

DeletedOutcomeView _parseDeletedOutcome(Object? json) {
  return switch (json) {
    {
      'number': final int number,
      'key': final String key,
      'outcome': final String outcome,
      'reasonKey': final String? reasonKey,
      'freedBytes': final int freedBytes,
    } =>
      DeletedOutcomeView(
        number: number,
        key: key,
        outcome: _parseKeyName(
          DeletedOutcome.values,
          outcome,
          DeletedOutcome.unknown,
        ),
        reasonKey: reasonKey == null
            ? null
            : _parseKeyName(
                DeletedReason.values,
                reasonKey,
                DeletedReason.unknown,
              ),
        freedBytes: freedBytes,
      ),
    _ => throw const FormatException('Unknown shape of an outcome.'),
  };
}

ItemDetailLine _parseDetailLine(Object? json) {
  return switch (json) {
    {'kind': final String kind, 'text': final String text} => ItemDetailLine(
      kind: _parseEnumName(ItemDetailLineKind.values, kind),
      text: text,
    ),
    _ => throw const FormatException('Unknown shape of a detail line.'),
  };
}

SkippedView _parseSkipped(Object? json) {
  return switch (json) {
    {'titleText': final String titleText, 'lines': final List<Object?> lines} =>
      SkippedView(titleText: titleText, lines: _parseLines(lines)),
    _ => throw const FormatException('Unknown shape of the skipped block.'),
  };
}

NoticeView _parseNotice(Object? json) {
  return switch (json) {
    {
      'titleText': final String titleText,
      'lines': final List<Object?> lines,
      'settingsLink': final Object? settingsLink,
    } =>
      NoticeView(
        titleText: titleText,
        lines: _parseLines(lines),
        settingsLink: settingsLink == null
            ? null
            : _parseLink(settingsLink, parseUrl: SystemSettingsUrl.parse),
      ),
    _ => throw const FormatException('Unknown shape of a notice.'),
  };
}

UpdateNoticeView _parseUpdateNotice(Object? json) {
  return switch (json) {
    {
      'titleText': final String titleText,
      'lines': final List<Object?> lines,
      'downloadLink': final Object? downloadLink,
    } =>
      UpdateNoticeView(
        titleText: titleText,
        lines: _parseLines(lines),
        downloadLink: _parseLink(downloadLink, parseUrl: ReleasePageUrl.parse),
      ),
    _ => throw const FormatException('Unknown shape of an update notice.'),
  };
}

/// [parseUrl] is the one kind of URL the field of the link may hold.
LinkView _parseLink(
  Object? json, {
  required OpenableUrl Function(String text) parseUrl,
}) {
  return switch (json) {
    {
      'labelText': final String labelText,
      'url': final String url,
      'failedText': final String failedText,
    } =>
      LinkView(
        labelText: labelText,
        url: parseUrl(url),
        failedText: failedText,
      ),
    _ => throw const FormatException('Unknown shape of a link.'),
  };
}

SectionKey _parseSectionKey(String name) {
  return _parseKeyName(SectionKey.values, name, SectionKey.unknown);
}

/// An instant the bridge writes as milliseconds since the epoch; `null`
/// stays `null`.
DateTime? _parseInstant(int? epochMs) {
  return epochMs == null
      ? null
      : DateTime.fromMillisecondsSinceEpoch(epochMs, isUtc: true);
}

/// For the enums whose members this app relies on: an unknown name throws.
TValue _parseEnumName<TValue extends Enum>(List<TValue> values, String name) {
  return values.asNameMap()[name] ??
      (throw FormatException('Unknown $TValue: $name'));
}

/// For the keys a newer bridge may add to: an unknown name is [unknown].
TValue _parseKeyName<TValue extends Enum>(
  List<TValue> values,
  String name,
  TValue unknown,
) {
  return values.asNameMap()[name] ?? unknown;
}

List<String> _parseLines(List<Object?> lines) {
  return [
    for (final Object? line in lines)
      line is String
          ? line
          : throw const FormatException('A line is not text.'),
  ];
}

List<int> _parseNumbers(List<Object?> numbers) {
  return [
    for (final Object? number in numbers)
      number is int
          ? number
          : throw const FormatException('A number is not an integer.'),
  ];
}
