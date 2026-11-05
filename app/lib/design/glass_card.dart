import 'dart:ui';

import 'package:flutter/widgets.dart';

import 'tokens.dart';

/// A card of frosted glass. It blurs what lies behind it through
/// `BackdropFilter.grouped`, so it needs the `BackdropGroup` of a
/// `CinematicStage` above it. An [accent] tints its rim and its inner light.
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.accent,
    this.padding = GlassTokens.cardPadding,
    this.borderRadius = GlassTokens.cardRadius,
  });

  final Widget child;
  final Color? accent;
  final EdgeInsetsGeometry padding;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(borderRadius);
    final Color? cardAccent = accent;
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: radius,
        boxShadow: <BoxShadow>[
          const BoxShadow(
            color: GlassTokens.shadow,
            blurRadius: GlassTokens.shadowBlur,
            offset: GlassTokens.shadowOffset,
            spreadRadius: -6,
          ),
          if (cardAccent != null)
            BoxShadow(
              color: cardAccent.withValues(alpha: GlassTokens.accentHaloAlpha),
              blurRadius: 48,
              spreadRadius: -10,
            ),
        ],
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter.grouped(
          filter: ImageFilter.blur(sigmaX: GlassTokens.blurSigma, sigmaY: GlassTokens.blurSigma),
          child: CustomPaint(
            painter: GlassSurfacePainter(borderRadius: borderRadius, accent: cardAccent),
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
  }
}

/// The glass itself, over the blur: a fill that fades downward, a light
/// rim that catches the top left, and a specular line along the top edge.
class GlassSurfacePainter extends CustomPainter {
  const GlassSurfacePainter({required this.borderRadius, required this.accent});

  final double borderRadius;
  final Color? accent;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect bounds = Offset.zero & size;
    final RRect shape = RRect.fromRectAndRadius(bounds, Radius.circular(borderRadius));
    final Color? surfaceAccent = accent;

    final Paint fill = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[GlassTokens.fillTop, GlassTokens.fillBottom],
      ).createShader(bounds);
    canvas.drawRRect(shape, fill);

    if (surfaceAccent != null) {
      final Paint accentLight = Paint()
        ..shader = RadialGradient(
          center: const Alignment(-0.85, -1.1),
          radius: 1.4,
          colors: <Color>[
            surfaceAccent.withValues(alpha: GlassTokens.accentTintAlpha * 2),
            surfaceAccent.withValues(alpha: 0),
          ],
        ).createShader(bounds);
      canvas.drawRRect(shape, accentLight);
    }

    final Paint rim = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: <Color>[
          GlassTokens.rimLight,
          GlassTokens.rimShade,
          surfaceAccent?.withValues(alpha: GlassTokens.accentRimAlpha) ?? GlassTokens.rimShade,
        ],
        stops: const <double>[0, 0.55, 1],
      ).createShader(bounds);
    canvas.drawRRect(shape.deflate(0.5), rim);

    final double inset = borderRadius * 0.8;
    final Paint specular = Paint()
      ..strokeWidth = 1
      ..shader = const LinearGradient(
        colors: <Color>[Color(0x00FFFFFF), GlassTokens.highlight, Color(0x00FFFFFF)],
        stops: <double>[0, 0.35, 1],
      ).createShader(Rect.fromLTWH(inset, 0, size.width - inset * 2, 1));
    canvas.drawLine(Offset(inset, 0.5), Offset(size.width - inset, 0.5), specular);
  }

  @override
  bool shouldRepaint(GlassSurfacePainter oldDelegate) =>
      oldDelegate.borderRadius != borderRadius || oldDelegate.accent != accent;
}
