import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../overview/overview.dart';
import '../removal/removal.dart';
import '../section/section.dart';
import '../settings/settings.dart';
import '../update/update.dart';
import 'app_destination.dart';
import 'navigation_controller.dart';

const Duration _pageTransitionDuration = Duration(milliseconds: 460);

/// The pages of the content pane, built from the destination. The Overview
/// stays below every other page, so a section's card flies into its page
/// and back. The flight and the fade are off while motion is reduced.
class DestinationNavigator extends StatefulWidget {
  const DestinationNavigator({
    super.key,
    required this.cleanerController,
    required this.updateController,
    required this.navigation,
    required this.urlOpener,
  });

  final CleanerController cleanerController;
  final UpdateController updateController;
  final NavigationController navigation;
  final UrlOpener urlOpener;

  @override
  State<DestinationNavigator> createState() => _DestinationNavigatorState();
}

class _DestinationNavigatorState extends State<DestinationNavigator> {
  final HeroController _heroController = MaterialApp.createMaterialHeroController();

  @override
  void dispose() {
    _heroController.dispose();
    super.dispose();
  }

  void _handleRemovedPage(Page<Object?> page) {
    final AppDestination destination = widget.navigation.destination;
    if (page.key == ValueKey<AppDestination>(destination)) {
      widget.navigation.showDestination(const OverviewDestination());
    }
  }

  void _showSection(SectionKey sectionKey) {
    widget.navigation.showDestination(buildSectionDestination(sectionKey));
  }

  StagePage _buildPage(AppDestination destination, {required bool isMotionReduced}) {
    final Widget child = switch (destination) {
      OverviewDestination() => OverviewPage(
        cleanerController: widget.cleanerController,
        updateController: widget.updateController,
        onSectionSelected: _showSection,
        onCleanSafeItems: () => cleanSafeItems(context, widget.cleanerController),
        urlOpener: widget.urlOpener,
      ),
      SectionDestination(:final sectionKey) => SectionPage(
        sectionKey: sectionKey,
        controller: widget.cleanerController,
        urlOpener: widget.urlOpener,
      ),
      HandledElsewhereDestination() => HandledElsewherePage(
        controller: widget.cleanerController,
        urlOpener: widget.urlOpener,
      ),
      SettingsDestination() => SettingsPage(
        updateController: widget.updateController,
        cleanerController: widget.cleanerController,
      ),
    };
    return StagePage(
      key: ValueKey<AppDestination>(destination),
      isMotionReduced: isMotionReduced,
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final bool isMotionReduced = MotionScope.of(context).isReduced;
    // The barrier of each route blocks the semantics painted before it in
    // its container; a container of its own keeps the sidebar and the
    // toolbar beside the pages reachable.
    return Semantics(
      container: true,
      child: HeroMode(
        enabled: !isMotionReduced,
        child: HeroControllerScope(
          controller: _heroController,
          child: ListenableBuilder(
            listenable: widget.navigation,
            builder: (BuildContext context, Widget? _) {
              final AppDestination destination = widget.navigation.destination;
              return Navigator(
                pages: [
                  _buildPage(
                    const OverviewDestination(),
                    isMotionReduced: isMotionReduced,
                  ),
                  if (destination is! OverviewDestination)
                    _buildPage(destination, isMotionReduced: isMotionReduced),
                ],
                onDidRemovePage: _handleRemovedPage,
              );
            },
          ),
        ),
      ),
    );
  }
}

/// A page of the content pane, which fades and rises in, at once while
/// [isMotionReduced].
final class StagePage extends Page<void> {
  const StagePage({
    required LocalKey super.key,
    required this.isMotionReduced,
    required this.child,
  });

  final bool isMotionReduced;
  final Widget child;

  @override
  Route<void> createRoute(BuildContext context) {
    return _StagePageRoute(page: this);
  }
}

final class _StagePageRoute extends PageRoute<void> {
  _StagePageRoute({required StagePage page}) : super(settings: page);

  // The navigator swaps in the page of each rebuild as the settings, so the
  // page is read from them rather than kept from the first build.
  StagePage get _page {
    final RouteSettings page = settings;
    if (page is StagePage) {
      return page;
    }
    throw StateError('A stage route holds its StagePage as its settings.');
  }

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  @override
  bool get maintainState => true;

  @override
  bool get opaque => true;

  @override
  Duration get transitionDuration {
    return _page.isMotionReduced ? Duration.zero : _pageTransitionDuration;
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return _page.child;
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    if (MotionScope.of(context).isReduced) {
      return child;
    }
    final Animation<double> arrival = animation.drive(
      CurveTween(curve: Curves.easeOutCubic),
    );
    return FadeTransition(
      opacity: arrival,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.025),
          end: Offset.zero,
        ).animate(arrival),
        child: child,
      ),
    );
  }
}
