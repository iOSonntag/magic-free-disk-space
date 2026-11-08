import 'package:flutter/widgets.dart';

import '../design/design.dart';

/// Eases the height of [child] when it changes, from the top; under reduced
/// motion the height jumps.
class SizeEase extends StatelessWidget {
  const SizeEase({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    // An AnimatedSize of zero duration re-dirties itself in its own layout,
    // so reduced motion leaves it out.
    if (MotionScope.of(context).isReduced) {
      return child;
    }
    return AnimatedSize(
      duration: MotionTokens.plainFade,
      curve: Curves.easeOutCubic,
      alignment: Alignment.topCenter,
      child: child,
    );
  }
}
