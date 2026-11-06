import 'package:flutter/material.dart';

import '../design/motion.dart';
import '../design/tokens.dart';

/// The look of an on/off switch, lit in [accent] while [value]. It takes no
/// tap; the row that holds it does.
class StageSwitchTrack extends StatelessWidget {
  const StageSwitchTrack({
    super.key,
    required this.value,
    required this.enabled,
    this.accent = StageColors.overviewAccent,
  });

  final bool value;
  final bool enabled;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final Duration duration = MotionScope.of(context).isReduced
        ? Duration.zero
        : MotionTokens.plainFade;
    return Opacity(
      opacity: enabled ? 1 : 0.42,
      child: AnimatedContainer(
        duration: duration,
        curve: Curves.easeOut,
        width: 44,
        height: 26,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(13),
          color: value
              ? accent.withValues(alpha: 0.85)
              : Colors.white.withValues(alpha: 0.1),
          border: Border.all(color: GlassTokens.rimLight),
          boxShadow: value
              ? [
                  BoxShadow(
                    color: accent.withValues(alpha: 0.45),
                    blurRadius: 16,
                    spreadRadius: -4,
                  ),
                ]
              : null,
        ),
        child: AnimatedAlign(
          duration: duration,
          curve: Curves.easeOut,
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 20,
            height: 20,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: StageColors.textPrimary,
            ),
          ),
        ),
      ),
    );
  }
}
