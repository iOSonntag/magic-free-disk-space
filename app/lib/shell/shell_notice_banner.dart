import 'package:flutter/material.dart';

import '../cleaner/cleaner.dart';
import '../design/design.dart';

/// The cleaner's notice and how grave it is.
final class ShellNotice {
  const ShellNotice({required this.text, required this.isScanLost});

  final String text;

  /// Whether a failure dropped the scan; a refusal or a cancel kept it.
  final bool isScanLost;
}

/// The cleaner's notice in [state], or `null` when it holds none.
ShellNotice? findShellNotice(CleanerState state) {
  return switch (state) {
    IdleState(:final String notice) => ShellNotice(text: notice, isScanLost: true),
    ScannedState(:final String notice) => ShellNotice(
      text: notice,
      isScanLost: false,
    ),
    IdleState() ||
    ScannedState() ||
    ScanningState() ||
    ConfirmingState() ||
    DeletingState() ||
    DeletedState() => null,
  };
}

/// The cleaner's notice above every page, so it shows whichever page asked:
/// why a scan or a delete stopped, or what the bridge refused.
class ShellNoticeBanner extends StatelessWidget {
  const ShellNoticeBanner({super.key, required this.state});

  final CleanerState state;

  @override
  Widget build(BuildContext context) {
    final ShellNotice? notice = findShellNotice(state);
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
