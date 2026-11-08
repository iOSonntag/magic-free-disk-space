import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// Each node of the current semantics tree that a tap acts on. Needs a test
/// with semantics on, as `testWidgets` has by default.
Iterable<SemanticsNode> findTappableNodes() {
  return find.semantics.byAction(SemanticsAction.tap).evaluate();
}

/// Each node [findTappableNodes] finds that has neither a label nor a
/// tooltip, described by its rect and its actions.
List<String> findUnlabelledTappableNodes() {
  return [
    for (final SemanticsNode node in findTappableNodes())
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
