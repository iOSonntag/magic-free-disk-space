import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/section/section.dart';

Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// The button around [label]: a [StageButton], or the Material button inside
/// an AccentButton or a QuietButton.
Finder findButtonAround(Finder label) {
  return find.ancestor(
    of: label,
    matching: find.byWidgetPredicate(
      (Widget widget) => widget is StageButton || widget is ButtonStyleButton,
    ),
  );
}

/// The button that shows the text [label], as [findButtonAround] finds it.
Finder findButtonLabelled(String label) {
  return findButtonAround(find.text(label));
}

/// Whether the one button [button] finds can be pressed.
bool isButtonEnabled(WidgetTester tester, Finder button) {
  final Widget widget = tester.widget(button);
  if (widget is StageButton) {
    return widget.onPressed != null;
  }
  if (widget is ButtonStyleButton) {
    return widget.enabled;
  }
  throw StateError('$widget is no button of the stage.');
}

/// The check mark of the row of item [number]: `true` while it is ticked.
bool? readRowMark(WidgetTester tester, int number) {
  return tester
      .widget<StageCheckMark>(
        find.descendant(
          of: find.byKey(ItemRowKey(number)),
          matching: find.byType(StageCheckMark),
        ),
      )
      .value;
}
