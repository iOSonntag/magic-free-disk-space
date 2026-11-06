import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';
import '../design/app_icons.dart';
import '../design/glass_card.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';

/// The cleaner's notice in [state] and how grave it is: a failure that
/// dropped the scan is [isScanLost], a refusal or a cancel kept it.
({String text, bool isScanLost})? findShellNotice(CleanerState state) {
  return switch (state) {
    IdleState(:final String? notice) when notice != null => (
      text: notice,
      isScanLost: true,
    ),
    ScannedState(:final String? notice) when notice != null => (
      text: notice,
      isScanLost: false,
    ),
    _ => null,
  };
}

/// The cleaner's notice above every page, so it shows whichever page asked:
/// why a scan or a delete stopped, or what the bridge refused.
class ShellNoticeBanner extends StatelessWidget {
  const ShellNoticeBanner({super.key, required this.state});

  final CleanerState state;

  @override
  Widget build(BuildContext context) {
    final ({String text, bool isScanLost})? notice = findShellNotice(state);
    if (notice == null) {
      return const SizedBox.shrink();
    }
    final Color accent = notice.isScanLost
        ? StageColors.careful
        : StageColors.review;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        StageSpacing.page,
        StageSpacing.small,
        StageSpacing.page,
        StageSpacing.small,
      ),
      child: GlassCard(
        accent: accent,
        padding: const EdgeInsets.symmetric(
          horizontal: StageSpacing.large - 4,
          vertical: StageSpacing.regular,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              notice.isScanLost ? AppIcons.failed : AppIcons.info,
              size: 22,
              color: accent,
            ),
            const SizedBox(width: StageSpacing.medium),
            Expanded(
              child: SelectionArea(
                child: Text(
                  notice.text,
                  style: TypeRamp.body.copyWith(color: StageColors.textPrimary),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
