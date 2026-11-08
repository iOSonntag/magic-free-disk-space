import 'package:flutter/material.dart';

import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';

/// Whether "Scan again" may start a scan in [state]: not while one runs,
/// and not while a delete is confirmed or runs.
bool canScanAgain(CleanerState state) {
  return switch (state) {
    IdleState() || ScannedState() || DeletedState() => true,
    ScanningState() || ConfirmingState() || DeletingState() => false,
  };
}

/// The bar above the content pane: what a running scan does, and "Scan
/// again".
class ShellToolbar extends StatelessWidget {
  const ShellToolbar({
    super.key,
    required this.state,
    required this.onScanAgain,
  });

  final CleanerState state;
  final VoidCallback onScanAgain;

  @override
  Widget build(BuildContext context) {
    final CleanerState state = this.state;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        StageSpacing.page,
        StageSpacing.tight,
        StageSpacing.large,
        StageSpacing.tight,
      ),
      child: Row(
        children: [
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: state is ScanningState
                  ? _ScanStatus(text: formatScanPhaseText(state))
                  : const SizedBox.shrink(),
            ),
          ),
          StageButton(
            label: 'Scan again',
            icon: AppIcons.scanAgain,
            onPressed: canScanAgain(state) ? onScanAgain : null,
          ),
        ],
      ),
    );
  }
}

class _ScanStatus extends StatelessWidget {
  const _ScanStatus({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: ScanSweep(
        isSweeping: true,
        accent: StageColors.overviewAccent,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: StageSpacing.regular,
            vertical: StageSpacing.small,
          ),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            color: StageColors.overviewAccent.withValues(alpha: 0.08),
            border: Border.all(
              color: StageColors.overviewAccent.withValues(alpha: 0.3),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: StageColors.overviewAccent,
                  boxShadow: [
                    BoxShadow(
                      color: StageColors.overviewAccent.withValues(alpha: 0.7),
                      blurRadius: 8,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: StageSpacing.small + 2),
              Flexible(
                child: Text(
                  '$text…',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeRamp.label,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
