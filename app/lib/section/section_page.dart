import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../shell/stage_page_scroll.dart';
import 'section_contents.dart';
import 'section_contents_view.dart';
import 'section_labels.dart';
import 'section_page_header.dart';
import 'section_totals.dart';

/// The page of one section: its safe, review and careful groups, each row
/// ticked into the one selection the bridge holds, and its advice.
class SectionPage extends StatelessWidget {
  const SectionPage({
    super.key,
    required this.sectionKey,
    required this.controller,
    required this.urlOpener,
  });

  final SectionKey sectionKey;
  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final CleanerState state = controller.state;
        final ScannedEvent? scan = findListedScan(state);
        return StagePageScroll(
          children: [
            SectionPageHeader(
              sectionKey: sectionKey,
              title: formatScanSectionTitle(sectionKey, scan: scan),
              total: findSectionTotal(listShownSectionTotals(state), sectionKey),
              isScanning: state is ScanningState,
            ),
            if (state is ListedState)
              _buildListedContents(state)
            else
              Text(
                state is ScanningState
                    ? 'Still scanning. Items land here as they are found.'
                    : 'Scan to see what this section holds.',
                style: TypeRamp.body,
              ),
          ],
        );
      },
    );
  }

  Widget _buildListedContents(ListedState state) {
    final SectionContents contents = buildSectionContents(state.scan, sectionKey);
    if (contents.isEmpty) {
      return Text('Nothing is left in this section.', style: TypeRamp.body);
    }
    return SectionContentsView(
      contents: contents,
      look: sectionKeyToLook(sectionKey),
      selectedNumbers: state.selectedNumbers,
      onToggle: state is ScannedState ? controller.toggleCandidate : null,
      revealPaths: state.scan.revealPaths,
      urlOpener: urlOpener,
      adviceTitle: 'To handle yourself',
    );
  }
}
