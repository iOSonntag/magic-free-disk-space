import 'package:flutter/material.dart';

import 'tokens.dart';
import 'type_ramp.dart';

/// How loud a [StageButton] is: [primary] is lit in its accent, [quiet] is
/// glass.
enum StageButtonTone { primary, quiet }

const double _buttonRadius = 14;

/// A labelled button of the stage. Disabled while [onPressed] is `null`. Its
/// semantics label is [semanticsLabel], or [label] when that is `null`.
class StageButton extends StatelessWidget {
  const StageButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.accent = StageColors.overviewAccent,
    this.tone = StageButtonTone.quiet,
    this.semanticsLabel,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final Color accent;
  final StageButtonTone tone;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null;
    final IconData? icon = this.icon;
    final bool isPrimary = tone == StageButtonTone.primary;
    final Color foreground = isPrimary
        ? StageColors.nightDeep
        : StageColors.textPrimary;
    final BoxDecoration decoration = isPrimary
        ? BoxDecoration(
            borderRadius: BorderRadius.circular(_buttonRadius),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color.lerp(accent, Colors.white, 0.18) ?? accent,
                accent,
              ],
            ),
            boxShadow: enabled
                ? [
                    BoxShadow(
                      color: accent.withValues(alpha: 0.45),
                      blurRadius: 24,
                      spreadRadius: -6,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : null,
          )
        : BoxDecoration(
            borderRadius: BorderRadius.circular(_buttonRadius),
            color: GlassTokens.fillTop,
            border: Border.all(color: GlassTokens.rimLight, width: 1),
          );
    return Semantics(
      container: true,
      button: true,
      enabled: enabled,
      label: semanticsLabel ?? label,
      child: Opacity(
        opacity: enabled ? 1 : 0.42,
        child: Material(
          type: MaterialType.transparency,
          child: Ink(
            decoration: decoration,
            child: InkWell(
              onTap: onPressed,
              borderRadius: BorderRadius.circular(_buttonRadius),
              hoverColor: Colors.white.withValues(alpha: isPrimary ? 0.14 : 0.06),
              splashColor: accent.withValues(alpha: 0.22),
              child: ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: StageSpacing.regular + 2,
                    vertical: StageSpacing.small + 3,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (icon != null) ...[
                        Icon(icon, size: 18, color: foreground),
                        const SizedBox(width: StageSpacing.small),
                      ],
                      Flexible(
                        child: Text(
                          label,
                          overflow: TextOverflow.ellipsis,
                          style: buildInterStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.1,
                            height: 1.3,
                            color: foreground,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
