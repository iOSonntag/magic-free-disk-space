import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';
import '../link/url_opener.dart';
import '../removal/deleted_page.dart';
import '../removal/deleting_view.dart';
import '../removal/review_page.dart';
import '../update/update_controller.dart';
import 'destination_navigator.dart';
import 'navigation_controller.dart';
import 'selection_bar.dart';
import 'shell_notice_banner.dart';
import 'shell_toolbar.dart';
import 'sidebar.dart';
import 'window_frame.dart';

/// The window: the sidebar beside the content pane, with "Scan again" above
/// it. The pane shows the chosen destination, and the steps of the delete
/// flow over it by the cleaner's state: Review while a plan waits for its
/// confirmation, Deleting, then the result. The destination's pages stay
/// built below a step, so they come back as they were.
class AppShell extends StatelessWidget {
  const AppShell({
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
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListenableBuilder(
        listenable: Listenable.merge([cleanerController, navigation]),
        builder: (BuildContext context, Widget? destinationPages) {
          final CleanerState state = cleanerController.state;
          final Widget? flowStep = _buildFlowStep(state);
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Sidebar(
                state: state,
                destination: navigation.destination,
                onDestinationSelected: flowStep == null
                    ? navigation.showDestination
                    : null,
              ),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: titleBarHeight),
                    ShellToolbar(state: state, onScanAgain: cleanerController.scan),
                    ShellNoticeBanner(state: state),
                    Expanded(
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: Offstage(
                              offstage: flowStep != null,
                              child: TickerMode(
                                enabled: flowStep == null,
                                child: destinationPages!,
                              ),
                            ),
                          ),
                          ?flowStep,
                          if (state is ScannedState && state.selectedNumbers.isNotEmpty)
                            Positioned(
                              left: 24,
                              right: 24,
                              bottom: 24,
                              child: Center(
                                child: SelectionBar(
                                  state: state,
                                  controller: cleanerController,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
        child: DestinationNavigator(
          cleanerController: cleanerController,
          updateController: updateController,
          navigation: navigation,
          urlOpener: urlOpener,
        ),
      ),
    );
  }

  /// The step of the delete flow [state] shows over the pages, or `null`
  /// when the pages show.
  Widget? _buildFlowStep(CleanerState state) {
    return switch (state) {
      ConfirmingState() => Positioned.fill(
        child: ReviewPage(state: state, controller: cleanerController),
      ),
      DeletingState() => Positioned.fill(child: DeletingView(state: state)),
      DeletedState() => Positioned.fill(
        child: DeletedPage(
          state: state,
          controller: cleanerController,
          urlOpener: urlOpener,
        ),
      ),
      IdleState() || ScanningState() || ScannedState() => null,
    };
  }
}
