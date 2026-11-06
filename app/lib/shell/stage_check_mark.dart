import 'package:flutter/material.dart';

import '../design/app_icons.dart';
import '../design/motion.dart';
import '../design/tokens.dart';

const double _markSide = 22;

/// The look of a tick box: lit in [accent] when [value] is `true`, a bar
/// when it is `null` (some of a group), empty glass when `false`. It takes no
/// tap; [StageCheckbox] and the item row wrap it.
class StageCheckMark extends StatelessWidget {
  const StageCheckMark({
    super.key,
    required this.value,
    required this.accent,
    required this.enabled,
  });

  final bool? value;
  final Color accent;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final bool lit = value ?? true;
    final bool isMixed = value == null;
    final Duration duration = MotionScope.of(context).isReduced
        ? Duration.zero
        : MotionTokens.plainFade;
    return Opacity(
      opacity: enabled ? 1 : 0.42,
      child: AnimatedContainer(
        duration: duration,
        curve: Curves.easeOut,
        width: _markSide,
        height: _markSide,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(7),
          color: lit ? accent : Colors.white.withValues(alpha: 0.04),
          border: Border.all(
            color: lit ? accent : Colors.white.withValues(alpha: 0.32),
            width: 1.4,
          ),
          boxShadow: lit
              ? [
                  BoxShadow(
                    color: accent.withValues(alpha: 0.5),
                    blurRadius: 14,
                    spreadRadius: -3,
                  ),
                ]
              : null,
        ),
        child: switch ((lit, isMixed)) {
          (false, _) => null,
          (true, true) => Center(
            child: Container(
              width: 10,
              height: 2.4,
              decoration: BoxDecoration(
                color: StageColors.nightDeep,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          (true, false) => const Icon(
            AppIcons.check,
            size: 18,
            weight: 700,
            color: StageColors.nightDeep,
          ),
        },
      ),
    );
  }
}

/// A tick box with a tap of its own, named by [semanticsLabel]. Disabled
/// while [onPressed] is `null`; a `null` [value] reads as "mixed".
class StageCheckbox extends StatelessWidget {
  const StageCheckbox({
    super.key,
    required this.value,
    required this.accent,
    required this.semanticsLabel,
    required this.onPressed,
  });

  final bool? value;
  final Color accent;
  final String semanticsLabel;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null;
    return Semantics(
      container: true,
      checked: value ?? false,
      mixed: value == null,
      enabled: enabled,
      label: semanticsLabel,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(10),
          hoverColor: accent.withValues(alpha: 0.1),
          child: SizedBox.square(
            dimension: 34,
            child: Center(
              child: StageCheckMark(
                value: value,
                accent: accent,
                enabled: enabled,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
