import 'package:flutter/material.dart';

import '../design/tokens.dart';
import '../design/type_ramp.dart';

/// The main action of a step of the delete flow: a filled button lit in
/// [accent], dimmed while [onPressed] is null.
class AccentButton extends StatelessWidget {
  const AccentButton({
    super.key,
    required this.label,
    required this.icon,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final IconData icon;
  final Color accent;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
        boxShadow: [
          if (enabled)
            BoxShadow(
              color: accent.withValues(alpha: 0.42),
              blurRadius: 28,
              spreadRadius: -4,
              offset: const Offset(0, 10),
            ),
        ],
      ),
      child: FilledButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 20, fill: 1, weight: 500),
        label: Text(label),
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: StageColors.nightDeep,
          disabledBackgroundColor: accent.withValues(alpha: 0.18),
          disabledForegroundColor: StageColors.textTertiary,
          padding: const EdgeInsets.symmetric(
            horizontal: StageSpacing.large,
            vertical: StageSpacing.regular,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
          ),
          textStyle: TypeRamp.label.copyWith(fontSize: 15),
        ),
      ),
    );
  }
}

/// A quiet action beside an [AccentButton], such as Cancel.
class QuietButton extends StatelessWidget {
  const QuietButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.autofocus = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final ButtonStyle style = TextButton.styleFrom(
      foregroundColor: StageColors.textPrimary,
      padding: const EdgeInsets.symmetric(
        horizontal: StageSpacing.regular,
        vertical: StageSpacing.regular,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
      ),
      textStyle: TypeRamp.label.copyWith(fontSize: 15),
    );
    final IconData? shownIcon = icon;
    if (shownIcon == null) {
      return TextButton(
        onPressed: onPressed,
        style: style,
        autofocus: autofocus,
        child: Text(label),
      );
    }
    return TextButton.icon(
      onPressed: onPressed,
      style: style,
      autofocus: autofocus,
      icon: Icon(shownIcon, size: 18),
      label: Text(label),
    );
  }
}
