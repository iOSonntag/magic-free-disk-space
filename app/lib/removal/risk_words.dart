import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../design/app_icons.dart';
import '../design/tokens.dart';

/// How the delete flow names and marks a risk: the words of the group the
/// section pages show it in.
typedef RiskWords = ({String label, IconData glyph, Color color});

RiskWords riskToWords(Risk risk) {
  return switch (risk) {
    Risk.safe => (
      label: 'Safe to remove',
      glyph: AppIcons.safeGroup,
      color: StageColors.safe,
    ),
    Risk.review => (
      label: 'Review first',
      glyph: AppIcons.reviewGroup,
      color: StageColors.review,
    ),
    // The bridge never plans an item of the risk never; were it to, it
    // reads as the strictest group.
    Risk.careful || Risk.never => (
      label: "Can't be undone",
      glyph: AppIcons.carefulGroup,
      color: StageColors.careful,
    ),
  };
}
