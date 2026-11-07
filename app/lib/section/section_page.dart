import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'section_contents_view.dart';
import 'section_page_header.dart';

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
      onToggleGroup: state is ScannedState ? controller.toggleCandidateGroup : null,
      revealPaths: state.scan.revealPaths,
      urlOpener: urlOpener,
      adviceTitle: 'To handle yourself',
    );
  }
}
