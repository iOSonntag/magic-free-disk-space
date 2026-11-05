import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/semantics_labels.dart';

Future<void> pumpControls(WidgetTester tester, List<Widget> controls) async {
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(body: Column(children: controls)),
    ),
  );
}

void main() {
  testWidgets('finds no node for a button with a text, a tooltip or a label', (
    WidgetTester tester,
  ) async {
    await pumpControls(tester, [
      TextButton(onPressed: () {}, child: const Text('Scan again')),
      IconButton(
        onPressed: () {},
        tooltip: 'Details',
        icon: const Icon(Icons.info),
      ),
      Semantics(
        label: 'Select the safe items',
        child: Checkbox(value: false, onChanged: (bool? _) {}),
      ),
    ]);

    expect(findUnlabelledTappableNodes(), isEmpty);
  });

  testWidgets('finds each tappable node without a label', (
    WidgetTester tester,
  ) async {
    await pumpControls(tester, [
      GestureDetector(
        onTap: () {},
        child: const SizedBox(width: 40, height: 40),
      ),
      Checkbox(value: false, onChanged: (bool? _) {}),
      const Text('Not tappable'),
    ]);

    expect(findUnlabelledTappableNodes(), hasLength(2));
  });
}
