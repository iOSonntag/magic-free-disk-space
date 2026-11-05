import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import '../feedback/error_text.dart';
import '../link/url_opener.dart';
import 'cleaner_controller.dart';
import 'confirmation_view.dart';
import 'scan_tiles.dart';
import 'status_banner.dart';
import 'text_styles.dart';

class CleanerPage extends StatelessWidget {
  const CleanerPage({
    super.key,
    required this.controller,
    required this.urlOpener,
    this.appBarActions = const [],
    this.banner,
  });

  final CleanerController controller;
  final UrlOpener urlOpener;

  /// Widgets of the app bar that the page shows without knowing them.
  final List<Widget> appBarActions;

  /// A widget above the status banner that the page shows without knowing
  /// it.
  final Widget? banner;

  @override
  Widget build(BuildContext context) {
    final Widget? banner = this.banner;
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final CleanerState state = controller.state;
        final List<NoticeView> statusNotices = controller.statusNotices;
        return Scaffold(
          appBar: AppBar(
            title: const Text('Magic Free Disk Space'),
            actions: appBarActions,
          ),
          body: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ?banner,
              if (statusNotices.isNotEmpty)
                StatusBanner(notices: statusNotices, urlOpener: urlOpener),
              Expanded(
                child: switch (state) {
                  IdleState() => _IdleView(
                    notice: state.notice,
                    onScan: controller.scan,
                  ),
                  ScanningState() => _ProgressView(
                    message: state.progressMessage,
                  ),
                  ScannedState() => _ScannedView(
                    state: state,
                    controller: controller,
                    urlOpener: urlOpener,
                  ),
                  ConfirmingState() => ConfirmationView(
                    plan: state.plan,
                    onConfirm: controller.confirmDeletion,
                    onCancel: controller.cancelConfirmation,
                  ),
                  DeletingState() => const _ProgressView(message: 'Deleting…'),
                  DeletedState() => _DeletedView(
                    lines: state.result.lines,
                    onScan: controller.scan,
                  ),
                },
              ),
            ],
          ),
          bottomNavigationBar: state is ScannedState
              ? _SelectionBar(state: state, controller: controller)
              : null,
        );
      },
    );
  }
}

class _IdleView extends StatelessWidget {
  const _IdleView({required this.notice, required this.onScan});

  final String? notice;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    final String? notice = this.notice;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (notice != null) ...[
              ErrorText(text: notice),
              const SizedBox(height: 16),
            ],
            const Text('Find what takes space on this Mac.'),
            const SizedBox(height: 16),
            FilledButton(onPressed: onScan, child: const Text('Scan')),
          ],
        ),
      ),
    );
  }
}

class _ProgressView extends StatelessWidget {
  const _ProgressView({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(message),
        ],
      ),
    );
  }
}

/// The scan top to bottom; each expansion tile has a [PageStorageKey], so it
/// keeps its open or collapsed state when the list is built again.
class _ScannedView extends StatelessWidget {
  const _ScannedView({
    required this.state,
    required this.controller,
    required this.urlOpener,
  });

  final ScannedState state;
  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final String? notice = state.notice;
    final ScannedEvent scan = state.scan;
    final ExploreView? explore = scan.explore;
    final SkippedView? skipped = scan.skipped;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (notice != null) ...[
          ErrorText(text: notice),
          const SizedBox(height: 12),
        ],
        Text(
          scan.summary.titleText,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        for (final String line in scan.summary.lines) Text(line),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton(
              onPressed: controller.selectSafeCandidates,
              child: const Text('Select safe'),
            ),
            OutlinedButton(
              onPressed: controller.clearSelection,
              child: const Text('Clear'),
            ),
            OutlinedButton(
              onPressed: controller.scan,
              child: const Text('Scan again'),
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (final SectionView section in scan.sections)
          SectionTile(
            key: PageStorageKey<String>('section ${section.titleText}'),
            section: section,
            selectedNumbers: state.selectedNumbers,
            onToggle: controller.toggleCandidate,
          ),
        if (explore != null)
          ExploreTile(
            key: const PageStorageKey<String>('explore'),
            explore: explore,
            selectedNumbers: state.selectedNumbers,
            onToggle: controller.toggleCandidate,
          ),
        if (skipped != null)
          SkippedTile(
            key: const PageStorageKey<String>('skipped'),
            skipped: skipped,
          ),
        for (final (int index, NoticeView scanNotice) in scan.notices.indexed)
          NoticeTile(
            key: PageStorageKey<String>('notice $index'),
            notice: scanNotice,
            urlOpener: urlOpener,
          ),
      ],
    );
  }
}

class _SelectionBar extends StatelessWidget {
  const _SelectionBar({required this.state, required this.controller});

  final ScannedState state;
  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    final int selectedCount = state.selectedNumbers.length;
    return BottomAppBar(
      child: Row(
        children: [
          Text('$selectedCount selected'),
          const Spacer(),
          FilledButton(
            onPressed: selectedCount > 0 ? controller.requestPlan : null,
            child: const Text('Delete…'),
          ),
        ],
      ),
    );
  }
}

class _DeletedView extends StatelessWidget {
  const _DeletedView({required this.lines, required this.onScan});

  final List<String> lines;
  final VoidCallback onScan;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SelectableText(lines.join('\n'), style: monospaceStyle),
        const SizedBox(height: 16),
        Align(
          alignment: Alignment.centerLeft,
          child: FilledButton(
            onPressed: onScan,
            child: const Text('Scan again'),
          ),
        ),
      ],
    );
  }
}
