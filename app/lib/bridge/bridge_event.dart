enum Risk { safe, review, careful, never }

final class CandidateView {
  const CandidateView({
    required this.number,
    required this.title,
    required this.path,
    required this.risk,
    required this.explanation,
    required this.regeneration,
    required this.sizeText,
  });

  final int number;
  final String title;
  final String path;
  final Risk risk;
  final String explanation;
  final String regeneration;
  final String sizeText;
}

sealed class BridgeEvent {
  const BridgeEvent();
}

final class ProgressEvent extends BridgeEvent {
  const ProgressEvent({required this.message});

  final String message;
}

final class ScannedEvent extends BridgeEvent {
  const ScannedEvent({
    required this.summaryText,
    required this.candidates,
    required this.notesLines,
  });

  final String summaryText;
  final List<CandidateView> candidates;
  final List<String> notesLines;
}

final class PlannedEvent extends BridgeEvent {
  const PlannedEvent({
    required this.planId,
    required this.lines,
    required this.confirmationWord,
  });

  final int planId;
  final List<String> lines;
  final String confirmationWord;
}

final class NothingApprovedEvent extends BridgeEvent {
  const NothingApprovedEvent({required this.lines});

  final List<String> lines;
}

final class DeletedEvent extends BridgeEvent {
  const DeletedEvent({required this.lines});

  final List<String> lines;
}

final class CancelledEvent extends BridgeEvent {
  const CancelledEvent();
}

final class FailedEvent extends BridgeEvent {
  const FailedEvent({required this.message, required this.isScanDropped});

  final String message;

  /// True when the bridge no longer holds a scan, so the app must scan again.
  final bool isScanDropped;
}

/// Parses one decoded line of the bridge; throws [FormatException] on any
/// shape it does not know.
BridgeEvent parseBridgeEvent(Object? json) {
  return switch (json) {
    {'kind': 'progress', 'message': final String message} => ProgressEvent(
      message: message,
    ),
    {
      'kind': 'scanned',
      'summaryText': final String summaryText,
      'candidates': final List<Object?> candidates,
      'notesLines': final List<Object?> notesLines,
    } =>
      ScannedEvent(
        summaryText: summaryText,
        candidates: candidates.map(_parseCandidate).toList(),
        notesLines: _parseLines(notesLines),
      ),
    {
      'kind': 'planned',
      'planId': final int planId,
      'lines': final List<Object?> lines,
      'confirmationWord': final String confirmationWord,
    } =>
      PlannedEvent(
        planId: planId,
        lines: _parseLines(lines),
        confirmationWord: confirmationWord,
      ),
    {'kind': 'nothingApproved', 'lines': final List<Object?> lines} =>
      NothingApprovedEvent(lines: _parseLines(lines)),
    {'kind': 'deleted', 'lines': final List<Object?> lines} => DeletedEvent(
      lines: _parseLines(lines),
    ),
    {'kind': 'cancelled'} => const CancelledEvent(),
    {
      'kind': 'failed',
      'message': final String message,
      'isScanDropped': final bool isScanDropped,
    } =>
      FailedEvent(message: message, isScanDropped: isScanDropped),
    {'kind': final String kind} => throw FormatException(
      'Unknown shape of the bridge event "$kind".',
    ),
    _ => throw const FormatException('A bridge line is not an event.'),
  };
}

CandidateView _parseCandidate(Object? json) {
  return switch (json) {
    {
      'number': final int number,
      'title': final String title,
      'path': final String path,
      'risk': final String risk,
      'explanation': final String explanation,
      'regeneration': final String regeneration,
      'sizeText': final String sizeText,
    } =>
      CandidateView(
        number: number,
        title: title,
        path: path,
        risk: _parseRisk(risk),
        explanation: explanation,
        regeneration: regeneration,
        sizeText: sizeText,
      ),
    _ => throw const FormatException('Unknown shape of a candidate.'),
  };
}

Risk _parseRisk(String name) {
  for (final Risk risk in Risk.values) {
    if (risk.name == name) {
      return risk;
    }
  }
  throw FormatException('Unknown risk: $name');
}

List<String> _parseLines(List<Object?> lines) {
  return [
    for (final Object? line in lines)
      line is String
          ? line
          : throw const FormatException('A line is not text.'),
  ];
}
