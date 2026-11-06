import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../section/section_contents.dart';
import '../section/section_contents_view.dart';
import '../section/section_labels.dart';
import '../section/section_page_header.dart';
import '../section/section_totals.dart';
import '../shell/stage_page_scroll.dart';

/// The space only Apple's own apps can free: a card per place with its
/// size, the app's own step, and a button that opens the app or its pane.
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
        return StagePageScroll(
          children: [
            SectionPageHeader(
              sectionKey: SectionKey.ownApp,
              title: formatSectionTitle(SectionKey.ownApp),
              total: findSectionTotal(listShownSectionTotals(state), SectionKey.ownApp),
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
              _buildListedContents(state)
            else
              Text(
                state is ScanningState
                    ? 'Still scanning.'
                    : 'Scan to see what only their own apps can free.',
                style: TypeRamp.body,
              ),
          ],
        );
      },
    );
  }

  Widget _buildListedContents(ListedState state) {
    final SectionContents contents = buildSectionContents(
      state.scan,
      SectionKey.ownApp,
    );
    if (contents.isEmpty) {
      return Text(
        'No app holds space here that only it can free.',
        style: TypeRamp.body,
      );
    }
    return SectionContentsView(
      contents: contents,
      look: sectionKeyToLook(SectionKey.ownApp),
      selectedNumbers: state.selectedNumbers,
      onToggle: state is ScannedState ? controller.toggleCandidate : null,
      revealPaths: state.scan.revealPaths,
      urlOpener: urlOpener,
      adviceTitle: 'In their own apps',
    );
  }
}
