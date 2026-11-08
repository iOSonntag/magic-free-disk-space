import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'section_contents_view.dart';
import 'section_page_header.dart';
import 'settings_place_cards.dart';

/// The title of the page until a scan gives the bridge's.
const String handledElsewhereTitle = 'Handled by its own app';

/// The space only Apple's own apps can free: a card per place with its
/// size, the app's own step, and a button that opens the app or its pane;
/// the places of System Settings show in every state.
class HandledElsewherePage extends StatelessWidget {
  const HandledElsewherePage({
    super.key,
    required this.controller,
    required this.urlOpener,
  });

  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final CleanerState state = controller.state;
        final SectionTotal? total = findSectionTotal(listShownSectionTotals(state), SectionKey.ownApp);
        return StagePageScroll(
          children: [
            SectionPageHeader(
              sectionKey: SectionKey.ownApp,
              title: total?.titleText ?? handledElsewhereTitle,
              total: total,
              isScanning: state is ScanningState,
            ),
            Padding(
              padding: const EdgeInsets.only(bottom: StageSpacing.large),
              child: Text(
                'This app never deletes these. Their own apps free the space safely; each card says how.',
                style: TypeRamp.body,
              ),
            ),
            if (state is ListedState)
              ListedSectionContents(
                state: state,
                sectionKey: SectionKey.ownApp,
                controller: controller,
                urlOpener: urlOpener,
                emptyText: 'No app holds space here that only it can free.',
                adviceTitle: 'In their own apps',
              )
            else
              Text(
                state is ScanningState
                    ? 'Still scanning.'
                    : 'Scan to see what only their own apps can free.',
                style: TypeRamp.body,
              ),
            SettingsPlaceCards(look: SectionLook.ownApp, urlOpener: urlOpener),
          ],
        );
      },
    );
  }
}
