import 'package:flutter/material.dart';

import 'tokens.dart';
import 'type_ramp.dart';

/// The Material theme of the always-dark stage, so Material's own widgets,
/// such as a checkbox, a text field or a dialog, wear the design's colours
/// and Inter. Scaffolds stay transparent over the stage's backdrop.
ThemeData buildStageTheme() {
  const ColorScheme colorScheme = ColorScheme.dark(
    primary: StageColors.overviewAccent,
    onPrimary: StageColors.nightDeep,
    secondary: StageColors.overviewAccent,
    onSecondary: StageColors.nightDeep,
    error: StageColors.careful,
    onError: StageColors.nightDeep,
    surface: StageColors.nightLifted,
    onSurface: StageColors.textPrimary,
  );
  return ThemeData(
    brightness: Brightness.dark,
    colorScheme: colorScheme,
    fontFamily: TypeRamp.fontFamily,
    scaffoldBackgroundColor: Colors.transparent,
    textTheme: TextTheme(
      displayLarge: TypeRamp.display,
      headlineMedium: TypeRamp.headline,
      titleMedium: TypeRamp.title,
      bodyMedium: TypeRamp.body,
      labelLarge: TypeRamp.label,
      bodySmall: TypeRamp.caption,
      labelSmall: TypeRamp.overline,
    ),
    iconTheme: const IconThemeData(color: StageColors.textSecondary, fill: 1, weight: 500, grade: 0, opticalSize: 24),
  );
}
