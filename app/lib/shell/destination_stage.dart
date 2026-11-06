import 'package:flutter/widgets.dart';

import '../design/cinematic_stage.dart';
import '../design/section_look.dart';
import '../design/tokens.dart';
import '../section/section_labels.dart';
import 'app_destination.dart';
import 'navigation_controller.dart';

Color getDestinationAccent(AppDestination destination) {
  return switch (destination) {
    OverviewDestination() || SettingsDestination() => StageColors.overviewAccent,
    SectionDestination(:final sectionKey) => sectionKeyToLook(sectionKey).accent,
    HandledElsewhereDestination() => SectionLook.ownApp.accent,
  };
}

/// The one [CinematicStage] under every route, its accent shifting to the
/// destination's. It holds the app's one backdrop group, so the glass of a
/// dialog route blurs in the same group as the pages.
class DestinationStage extends StatelessWidget {
  const DestinationStage({
    super.key,
    required this.navigation,
    required this.child,
  });

  final NavigationController navigation;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: navigation,
      builder: (BuildContext context, Widget? child) {
        return CinematicStage(
          accent: getDestinationAccent(navigation.destination),
          child: child!,
        );
      },
      child: child,
    );
  }
}
