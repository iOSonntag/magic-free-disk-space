import 'package:flutter/material.dart';

import '../cleaner/cleaner.dart';
import '../link/link.dart';
import '../removal/removal.dart';
import '../update/update.dart';
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
    final Widget destinationPages = DestinationNavigator(
      cleanerController: cleanerController,
      updateController: updateController,
      navigation: navigation,
      urlOpener: urlOpener,
    );
    return Scaffold(
      body: ListenableBuilder(
        listenable: Listenable.merge([cleanerController, navigation]),
        builder: (BuildContext context, Widget? _) {
          final CleanerState state = cleanerController.state;
          final bool isFlowStepShown = state is RemovalFlowState;
          return Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Sidebar(
                state: state,
                destination: navigation.destination,
                onDestinationSelected: isFlowStepShown
                    ? null
                    : navigation.showDestination,
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
                            // Offstage keeps the pages in the focus tree, so
                            // Tab would reach their controls under the step.
                            child: ExcludeFocus(
                              excluding: isFlowStepShown,
                              child: Offstage(
                                offstage: isFlowStepShown,
                                child: TickerMode(
                                  enabled: !isFlowStepShown,
                                  child: destinationPages,
                                ),
                              ),
                            ),
                          ),
                          if (state is RemovalFlowState)
                            Positioned.fill(
                              child: RemovalFlowStep(
                                state: state,
                                controller: cleanerController,
                                urlOpener: urlOpener,
                              ),
                            ),
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
      ),
    );
  }
}
