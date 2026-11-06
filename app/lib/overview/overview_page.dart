import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';
import '../design/app_icons.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../section/section_labels.dart';
import '../section/section_totals.dart';
import '../shell/navigation_controller.dart';
import '../shell/stage_page_scroll.dart';
import '../update/update_controller.dart';
import 'disk_panel.dart';
import 'notice_card.dart';
import 'section_card.dart';

/// The first page: the disk ring with "Clean safe items", a card per section
/// that leads to its page, and the cards of Full Disk Access, an update and
/// the scan's notices.
class OverviewPage extends StatelessWidget {
  const OverviewPage({
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
    return ListenableBuilder(
      listenable: Listenable.merge([cleanerController, updateController]),
      builder: (BuildContext context, Widget? _) {
        final CleanerState state = cleanerController.state;
        final ScannedEvent? scan = findListedScan(state);
        final List<SectionTotal> totals = listShownSectionTotals(state);
        final UpdateNoticeView? updateNotice = updateController.notice;
        return StagePageScroll(
          children: [
            Text('Overview', style: TypeRamp.headline),
            const SizedBox(height: StageSpacing.large),
            DiskPanel(controller: cleanerController),
            for (final NoticeView notice in cleanerController.statusNotices) ...[
              const SizedBox(height: StageSpacing.regular),
              NoticeCard(
                glyph: AppIcons.fullDiskAccess,
                accent: StageColors.review,
                titleText: notice.titleText,
                lines: notice.lines,
                link: notice.settingsLink,
                urlOpener: urlOpener,
              ),
            ],
            if (updateNotice != null) ...[
              const SizedBox(height: StageSpacing.regular),
              NoticeCard(
                glyph: AppIcons.update,
                accent: StageColors.overviewAccent,
                titleText: updateNotice.titleText,
                lines: updateNotice.lines,
                link: updateNotice.downloadLink,
                urlOpener: urlOpener,
              ),
            ],
            if (totals.isNotEmpty) ...[
              const SizedBox(height: StageSpacing.extraLarge),
              Text('WHERE THE SPACE IS', style: TypeRamp.overline),
              const SizedBox(height: StageSpacing.medium),
              Wrap(
                spacing: StageSpacing.regular,
                runSpacing: StageSpacing.regular,
                children: [
                  for (final SectionTotal total in totals)
                    SectionCard(
                      key: SectionCardKey(total.sectionKey),
                      total: total,
                      title: formatScanSectionTitle(total.sectionKey, scan: scan),
                      isScanning: state is ScanningState,
                      onPressed: () => navigation.showDestination(
                        buildSectionDestination(total.sectionKey),
                      ),
                    ),
                ],
              ),
            ],
            if (scan != null &&
                (scan.notices.isNotEmpty || scan.skipped != null)) ...[
              const SizedBox(height: StageSpacing.extraLarge),
              Text('NOTES ON THIS SCAN', style: TypeRamp.overline),
              for (final NoticeView notice in scan.notices) ...[
                const SizedBox(height: StageSpacing.medium),
                NoticeCard(
                  glyph: AppIcons.info,
                  accent: StageColors.textTertiary,
                  titleText: notice.titleText,
                  lines: notice.lines,
                  link: notice.settingsLink,
                  urlOpener: urlOpener,
                ),
              ],
              if (scan.skipped case final SkippedView skipped) ...[
                const SizedBox(height: StageSpacing.medium),
                NoticeCard(
                  glyph: AppIcons.info,
                  accent: StageColors.textTertiary,
                  titleText: skipped.titleText,
                  lines: skipped.lines,
                  link: null,
                  urlOpener: urlOpener,
                ),
              ],
            ],
          ],
        );
      },
    );
  }
}
