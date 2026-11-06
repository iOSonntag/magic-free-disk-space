import 'package:flutter/material.dart';

import '../design/tokens.dart';

/// A round button that shows only [icon]; [semanticsLabel] names it. Lit in
/// [accent] while [isExpanded], which it also reports to assistive tech.
class StageIconButton extends StatelessWidget {
  const StageIconButton({
    super.key,
    required this.icon,
    required this.semanticsLabel,
    required this.onPressed,
    required this.isExpanded,
    this.accent = StageColors.overviewAccent,
  });

  final IconData icon;
  final String semanticsLabel;
  final VoidCallback? onPressed;
  final bool isExpanded;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      button: true,
      enabled: onPressed != null,
      expanded: isExpanded,
      label: semanticsLabel,
      child: Material(
        type: MaterialType.transparency,
        child: Ink(
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isExpanded
                ? accent.withValues(alpha: 0.18)
                : Colors.transparent,
            border: Border.all(
              color: isExpanded
                  ? accent.withValues(alpha: 0.6)
                  : Colors.transparent,
            ),
          ),
          child: InkWell(
            onTap: onPressed,
            customBorder: const CircleBorder(),
            hoverColor: Colors.white.withValues(alpha: 0.08),
            child: ExcludeSemantics(
              child: SizedBox.square(
                dimension: 34,
                child: Icon(
                  icon,
                  size: 20,
                  color: isExpanded ? accent : StageColors.textSecondary,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
