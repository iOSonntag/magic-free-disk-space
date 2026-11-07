import 'package:flutter/material.dart';

import 'glass_card.dart';
import 'motion.dart';
import 'tokens.dart';

/// A [GlassCard] that is one button: a tap anywhere on it runs [onPressed],
/// and assistive tech reads it as [semanticsLabel] alone. It lifts toward
/// the pointer while hovered, unless motion is reduced.
class GlassCardButton extends StatefulWidget {
  const GlassCardButton({
    super.key,
    required this.accent,
    required this.semanticsLabel,
    required this.onPressed,
    required this.child,
  });

  final Color accent;
  final String semanticsLabel;
  final VoidCallback onPressed;
  final Widget child;

  @override
  State<GlassCardButton> createState() => _GlassCardButtonState();
}

class _GlassCardButtonState extends State<GlassCardButton> {
  bool _isHovered = false;

  @override
  Widget build(BuildContext context) {
    final MotionState motion = MotionScope.of(context);
    final BorderRadius radius = BorderRadius.circular(GlassTokens.cardRadius);
    return Semantics(
      container: true,
      button: true,
      label: widget.semanticsLabel,
      child: AnimatedScale(
        scale: _isHovered && !motion.isReduced ? 1.018 : 1,
        duration: motion.plainFadeDuration,
        curve: Curves.easeOut,
        child: Stack(
          children: [
            ExcludeSemantics(
              child: GlassCard(accent: widget.accent, child: widget.child),
            ),
            Positioned.fill(
              child: Material(
                type: MaterialType.transparency,
                child: InkWell(
                  onTap: widget.onPressed,
                  onHover: (bool hovered) {
                    setState(() {
                      _isHovered = hovered;
                    });
                  },
                  borderRadius: radius,
                  hoverColor: widget.accent.withValues(alpha: 0.06),
                  splashColor: widget.accent.withValues(alpha: 0.16),
                  highlightColor: widget.accent.withValues(alpha: 0.08),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
