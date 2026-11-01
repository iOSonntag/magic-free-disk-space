import 'system_settings_url.dart';

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

final class ItemDetailLine {
  const ItemDetailLine({required this.kind, required this.text});

  final ItemDetailLineKind kind;
  final String text;
}

/// A selectable item; [number] is what the selection names.
final class ItemView {
  const ItemView({
    required this.number,
    required this.title,
    required this.risk,
    required this.riskText,
    required this.sizeText,
    required this.detailLines,
  });

  final int number;
  final String title;
  final Risk risk;
  final String riskText;
  final String sizeText;
  final List<ItemDetailLine> detailLines;
}

/// An item the tool never removes, so it has no number and no selection.
final class AdviceItemView {
  const AdviceItemView({
    required this.title,
    required this.risk,
    required this.riskText,
    required this.sizeText,
    required this.detailLines,
  });

  final String title;
  final Risk risk;
  final String riskText;
  final String sizeText;
  final List<ItemDetailLine> detailLines;
}

final class SummaryView {
  const SummaryView({required this.titleText, required this.lines});

  final String titleText;
  final List<String> lines;
}

final class SectionView {
  const SectionView({
    required this.titleText,
    required this.sizeText,
    required this.isInitiallyExpanded,
    required this.items,
    required this.checkGroup,
  });

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

/// A button that opens a pane of System Settings; [failedText] shows when it
/// did not open.
final class SettingsLinkView {
  const SettingsLinkView({
    required this.labelText,
    required this.url,
    required this.failedText,
  });

  final String labelText;
  final SystemSettingsUrl url;
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
  final SettingsLinkView? settingsLink;
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

final class ProgressEvent extends BridgeEvent {
  const ProgressEvent({required this.message});

  final String message;
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
  });

  final SummaryView summary;
  final List<SectionView> sections;
  final ExploreView? explore;

  /// The numbers "Select safe" picks.
  final List<int> safeNumbers;
  final SkippedView? skipped;
  final List<NoticeView> notices;
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
  });

  final int planId;
  final List<String> lines;
  final List<String> warningLines;
}

final class NothingApprovedEvent extends BridgeEvent implements PlanAnswer {
  const NothingApprovedEvent({required this.lines});

  final List<String> lines;
}

final class DeletedEvent extends BridgeEvent implements DeleteAnswer {
  const DeletedEvent({required this.lines});

  final List<String> lines;
}

final class CancelledEvent extends BridgeEvent implements DeleteAnswer {
  const CancelledEvent({required this.message});

  final String message;
}

final class FailedEvent extends BridgeEvent
    implements ScanAnswer, PlanAnswer, DeleteAnswer, StatusAnswer {
  const FailedEvent({required this.message, required this.effect});

  final String message;
  final FailureEffect effect;
}

/// What a failure did to the bridge: after [scanDropped] the app must scan
/// again; after [bridgeStopping] the bridge exits, so the next request needs
/// a new one.
enum FailureEffect { scanKept, scanDropped, bridgeStopping }

/// Parses one decoded line of the bridge; throws [FormatException] on any
/// shape it does not know.
BridgeEvent parseBridgeEvent(Object? json) {
  return switch (json) {
    {'kind': 'progress', 'message': final String message} => ProgressEvent(
      message: message,
    ),
    {
      'kind': 'scanned',
      'summary': final Object? summary,
      'sections': final List<Object?> sections,
      'explore': final Object? explore,
      'safeNumbers': final List<Object?> safeNumbers,
      'skipped': final Object? skipped,
      'notices': final List<Object?> notices,
    } =>
      ScannedEvent(
        summary: _parseSummary(summary),
        sections: sections.map(_parseSection).toList(),
        explore: explore == null ? null : _parseExplore(explore),
        safeNumbers: _parseNumbers(safeNumbers),
        skipped: skipped == null ? null : _parseSkipped(skipped),
        notices: notices.map(_parseNotice).toList(),
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
    } =>
      PlannedEvent(
        planId: planId,
        lines: _parseLines(lines),
        warningLines: _parseLines(warningLines),
      ),
    {'kind': 'nothingApproved', 'lines': final List<Object?> lines} =>
      NothingApprovedEvent(lines: _parseLines(lines)),
    {'kind': 'deleted', 'lines': final List<Object?> lines} => DeletedEvent(
      lines: _parseLines(lines),
    ),
    {'kind': 'cancelled', 'message': final String message} => CancelledEvent(
      message: message,
    ),
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
    {'titleText': final String titleText, 'lines': final List<Object?> lines} =>
      SummaryView(titleText: titleText, lines: _parseLines(lines)),
    _ => throw const FormatException('Unknown shape of the summary.'),
  };
}

SectionView _parseSection(Object? json) {
  return switch (json) {
    {
      'titleText': final String titleText,
      'sizeText': final String sizeText,
      'isInitiallyExpanded': final bool isInitiallyExpanded,
      'items': final List<Object?> items,
      'checkGroup': final Object? checkGroup,
    } =>
      SectionView(
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
      'title': final String title,
      'risk': final String risk,
      'riskText': final String riskText,
      'sizeText': final String sizeText,
      'detailLines': final List<Object?> detailLines,
    } =>
      ItemView(
        number: number,
        title: title,
        risk: _parseEnumName(Risk.values, risk),
        riskText: riskText,
        sizeText: sizeText,
        detailLines: detailLines.map(_parseDetailLine).toList(),
      ),
    _ => throw const FormatException('Unknown shape of an item.'),
  };
}

AdviceItemView _parseAdviceItem(Object? json) {
  return switch (json) {
    {
      'title': final String title,
      'risk': final String risk,
      'riskText': final String riskText,
      'sizeText': final String sizeText,
      'detailLines': final List<Object?> detailLines,
    } =>
      AdviceItemView(
        title: title,
        risk: _parseEnumName(Risk.values, risk),
        riskText: riskText,
        sizeText: sizeText,
        detailLines: detailLines.map(_parseDetailLine).toList(),
      ),
    _ => throw const FormatException('Unknown shape of an advice item.'),
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
            : _parseSettingsLink(settingsLink),
      ),
    _ => throw const FormatException('Unknown shape of a notice.'),
  };
}

SettingsLinkView _parseSettingsLink(Object? json) {
  return switch (json) {
    {
      'labelText': final String labelText,
      'url': final String url,
      'failedText': final String failedText,
    } =>
      SettingsLinkView(
        labelText: labelText,
        url: SystemSettingsUrl.parse(url),
        failedText: failedText,
      ),
    _ => throw const FormatException('Unknown shape of a settings link.'),
  };
}

TValue _parseEnumName<TValue extends Enum>(List<TValue> values, String name) {
  return values.asNameMap()[name] ??
      (throw FormatException('Unknown $TValue: $name'));
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
