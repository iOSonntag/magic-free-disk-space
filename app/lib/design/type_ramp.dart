import 'package:flutter/painting.dart';

import 'tokens.dart';

/// The text styles of the app, in the bundled variable Inter. Each style
/// sets its weight twice, as a [FontWeight] and as the font's `wght` axis,
/// and its optical size on the `opsz` axis.
abstract final class TypeRamp {
  static const String fontFamily = 'Inter';

  /// The figure in the disk ring: tabular, so a count-up does not jitter.
  static final TextStyle display = buildInterStyle(
    fontSize: 56,
    fontWeight: FontWeight.w700,
    letterSpacing: -1.8,
    height: 1.0,
    color: StageColors.textPrimary,
    hasTabularFigures: true,
  );
  static final TextStyle headline = buildInterStyle(
    fontSize: 28,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.6,
    height: 1.15,
    color: StageColors.textPrimary,
  );
  static final TextStyle title = buildInterStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    height: 1.25,
    color: StageColors.textPrimary,
  );
  static final TextStyle figure = buildInterStyle(
    fontSize: 18,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.2,
    height: 1.25,
    color: StageColors.textPrimary,
    hasTabularFigures: true,
  );
  static final TextStyle body = buildInterStyle(
    fontSize: 14,
    fontWeight: FontWeight.w400,
    letterSpacing: 0,
    height: 1.45,
    color: StageColors.textSecondary,
  );
  static final TextStyle label = buildInterStyle(
    fontSize: 13,
    fontWeight: FontWeight.w500,
    letterSpacing: 0.1,
    height: 1.3,
    color: StageColors.textPrimary,
  );
  static final TextStyle caption = buildInterStyle(
    fontSize: 12,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.2,
    height: 1.35,
    color: StageColors.textTertiary,
  );
  static final TextStyle overline = buildInterStyle(
    fontSize: 11,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.2,
    height: 1.3,
    color: StageColors.textTertiary,
  );
}

/// Builds an Inter style whose `wght` axis follows [fontWeight] and whose
/// `opsz` axis follows [fontSize] within the font's range of 14 to 32.
TextStyle buildInterStyle({
  required double fontSize,
  required FontWeight fontWeight,
  required double letterSpacing,
  required double height,
  required Color color,
  bool hasTabularFigures = false,
}) {
  final double opticalSize = fontSize.clamp(14, 32).toDouble();
  return TextStyle(
    fontFamily: TypeRamp.fontFamily,
    fontSize: fontSize,
    fontWeight: fontWeight,
    fontVariations: <FontVariation>[
      FontVariation.weight(fontWeight.value.toDouble()),
      FontVariation.opticalSize(opticalSize),
    ],
    fontFeatures: hasTabularFigures ? const <FontFeature>[FontFeature.tabularFigures()] : null,
    letterSpacing: letterSpacing,
    height: height,
    color: color,
  );
}
