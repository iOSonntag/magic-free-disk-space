import 'package:flutter/widgets.dart';

import 'tokens.dart';

/// The room a page leaves below its last card, so the floating selection
/// bar never covers it.
const double selectionBarClearance = 112;

/// The scrolling column every page of the content pane stands in.
class StagePageScroll extends StatelessWidget {
  const StagePageScroll({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        StageSpacing.page,
        StageSpacing.regular,
        StageSpacing.page,
        selectionBarClearance,
      ),
      children: children,
    );
  }
}
