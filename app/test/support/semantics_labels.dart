import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Each node of the current semantics tree that a tap acts on and that has
/// neither a label nor a tooltip, described by its rect and its actions.
/// Needs a test with semantics on, as `testWidgets` has by default.
List<String> findUnlabelledTappableNodes() {
  final Iterable<SemanticsNode> tappableNodes = find.semantics
      .byAction(SemanticsAction.tap)
      .evaluate();
  return [
    for (final SemanticsNode node in tappableNodes)
      if (!_hasLabel(node)) node.toString(),
  ];
}

/// Fails the test when a node a tap acts on has no label, naming each one.
void expectEveryTappableNodeLabelled() {
  expect(
    findUnlabelledTappableNodes(),
    isEmpty,
    reason: 'Every control a tap acts on needs a semantics label.',
  );
}

bool _hasLabel(SemanticsNode node) {
  final SemanticsData data = node.getSemanticsData();
  return data.label.trim().isNotEmpty || data.tooltip.trim().isNotEmpty;
}
