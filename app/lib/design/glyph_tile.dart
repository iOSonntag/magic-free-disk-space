import 'package:flutter/widgets.dart';

import 'glass_card.dart';
import 'section_glow.dart';
import 'tokens.dart';

/// A small tile of tinted glass holding one glowing glyph, with the bloom
/// of its accent behind it. It blurs nothing itself, so a card may hold
/// many.
class GlyphTile extends StatelessWidget {
  const GlyphTile({super.key, required this.glyph, required this.accent, this.size = 44});

  final IconData glyph;
  final Color accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    final double glyphSize = size * 0.54;
    return SectionGlow(
      accent: accent,
      intensity: 0.8,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _GlyphTileTintPainter(accent: accent, borderRadius: GlassTokens.tileRadius),
          foregroundPainter: GlassSurfacePainter(borderRadius: GlassTokens.tileRadius, accent: accent),
          child: Center(
            child: Icon(
              glyph,
              size: glyphSize,
              color: Color.lerp(accent, const Color(0xFFFFFFFF), 0.22),
              fill: 1,
              weight: 500,
              grade: 0,
              opticalSize: glyphSize.clamp(20, 48).toDouble(),
              shadows: <Shadow>[Shadow(color: accent.withValues(alpha: 0.85), blurRadius: 14)],
            ),
          ),
        ),
      ),
    );
  }
}

class _GlyphTileTintPainter extends CustomPainter {
  const _GlyphTileTintPainter({required this.accent, required this.borderRadius});

  final Color accent;
  final double borderRadius;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect bounds = Offset.zero & size;
    const Color black = Color(0xFF000000);
    final Paint tint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[
          Color.lerp(accent, black, 0.55)!.withValues(alpha: 0.6),
          Color.lerp(accent, black, 0.8)!.withValues(alpha: 0.4),
        ],
      ).createShader(bounds);
    canvas.drawRRect(RRect.fromRectAndRadius(bounds, Radius.circular(borderRadius)), tint);
  }

  @override
  bool shouldRepaint(_GlyphTileTintPainter oldDelegate) =>
      oldDelegate.accent != accent || oldDelegate.borderRadius != borderRadius;
}
