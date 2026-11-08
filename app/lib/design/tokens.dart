import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

/// The colours of the always-dark stage and of the text on it.
abstract final class StageColors {
  static const Color night = Color(0xFF05060B);
  static const Color nightLifted = Color(0xFF0B1022);
  static const Color nightDeep = Color(0xFF020308);

  static const Color textPrimary = Color(0xFFF4F6FB);
  static const Color textSecondary = Color(0xB8E3E8F4);
  static const Color textTertiary = Color(0x7AD5DCEC);

  /// The light of the Overview and the disk ring, where no section is in view.
  static const Color overviewAccent = Color(0xFF6FE7FF);

  static const Color safe = Color(0xFF4BE3A0);
  static const Color review = Color(0xFFFFC857);
  static const Color careful = Color(0xFFFF5A6E);

  static const Color diskUsed = Color(0xFF5A6478);
  static const Color diskAvailable = Color(0xFF151A26);
}

/// The glass of the cards: its blur, fill, rim and shadow.
abstract final class GlassTokens {
  /// One sigma for every card, so the cards of one `BackdropGroup` share one blur.
  static const double blurSigma = 28;
  static const double cardRadius = 22;
  static const double tileRadius = 14;
  static const EdgeInsets cardPadding = EdgeInsets.all(20);

  static const Color fillTop = Color(0x1AFFFFFF);
  static const Color fillBottom = Color(0x08FFFFFF);
  static const Color rimLight = Color(0x47FFFFFF);
  static const Color rimShade = Color(0x0FFFFFFF);
  static const Color highlight = Color(0x59FFFFFF);
  static const Color shadow = Color(0x8C000000);
  static const double shadowBlur = 36;
  static const Offset shadowOffset = Offset(0, 18);

  /// How strongly an accent tints the glass it lights.
  static const double accentTintAlpha = 0.07;
  static const double accentRimAlpha = 0.38;
  static const double accentHaloAlpha = 0.16;
}

/// The reach and strength of the glows around tiles and the disk ring.
abstract final class GlowTokens {
  static const double tileHaloScale = 1.9;
  static const double coreAlpha = 0.42;
  static const double haloAlpha = 0.14;

  /// The breathing of a glow while ambient motion runs, as a share of its strength.
  static const double breathDepth = 0.16;
  static const double breathPerSecond = 0.12;
}

/// The looks the controls of the stage share, so they change together.
abstract final class ControlTokens {
  /// The opacity of a disabled button, check mark or switch.
  static const double disabledOpacity = 0.42;
}

/// The spacing steps every page lays out on.
abstract final class StageSpacing {
  static const double tight = 4;
  static const double small = 8;
  static const double medium = 12;
  static const double regular = 16;
  static const double large = 24;
  static const double extraLarge = 32;
  static const double page = 48;
}

/// The durations and curves of every animation. Each one is skipped or
/// replaced by a plain fade while motion is reduced.
abstract final class MotionTokens {
  static const Duration countUp = Duration(milliseconds: 1100);
  static const Curve countUpCurve = Curves.easeOutCubic;

  static const Duration ringFill = Duration(milliseconds: 1400);
  static const Curve ringFillCurve = Curves.easeInOutCubic;

  static const Duration accentShift = Duration(milliseconds: 900);
  static const Curve accentShiftCurve = Curves.easeInOut;

  static const Duration dissolve = Duration(milliseconds: 950);
  static const Duration plainFade = Duration(milliseconds: 220);

  static const Duration sweepPeriod = Duration(milliseconds: 2600);

  /// One turn of the disk ring's scan sweep.
  static const Duration ringSweepPeriod = Duration(milliseconds: 1800);
}
