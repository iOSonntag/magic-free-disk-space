import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import 'candidate_tile.dart';
import 'cleaner_controller.dart';
import 'deletion_dialog.dart';

class CleanerPage extends StatelessWidget {
  const CleanerPage({super.key, required this.controller});

  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final CleanerState state = controller.state;
        return Scaffold(
          appBar: AppBar(title: const Text('Magic Free Disk Space')),
          body: switch (state) {
            IdleState() => _IdleView(
              notice: state.notice,
              onScan: controller.scan,
            ),
            ScanningState() => _ProgressView(message: state.progressMessage),
            ScannedState() => _ScannedView(
              state: state,
              controller: controller,
            ),
            DeletingState() => const _ProgressView(message: 'Deleting…'),
            DeletedState() => _DeletedView(
              lines: state.lines,
              onScan: controller.scan,
            ),
            FailedState() => _IdleView(
              notice: state.message,
              onScan: controller.scan,
            ),
          },
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
              _NoticeText(notice: notice),
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

class _ScannedView extends StatelessWidget {
  const _ScannedView({required this.state, required this.controller});

  final ScannedState state;
  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    final String? notice = state.notice;
    final List<String> notesLines = state.scan.notesLines;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (notice != null) ...[
          _NoticeText(notice: notice),
          const SizedBox(height: 12),
        ],
        Text(
          state.scan.summaryText,
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton(
              onPressed: controller.selectSafe,
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
        for (final CandidateView candidate in state.scan.candidates)
          CandidateTile(
            candidate: candidate,
            isSelected: state.selectedNumbers.contains(candidate.number),
            onToggle: () => controller.toggle(candidate.number),
          ),
        if (notesLines.isNotEmpty)
          ExpansionTile(
            title: const Text('Notes'),
            expandedAlignment: Alignment.centerLeft,
            children: [
              SelectableText(notesLines.join('\n'), style: monospaceStyle),
            ],
          ),
      ],
    );
  }
}

class _SelectionBar extends StatelessWidget {
  const _SelectionBar({required this.state, required this.controller});

  final ScannedState state;
  final CleanerController controller;

  Future<void> _requestDeletion(BuildContext context) async {
    final BridgeEvent? answer = await controller.requestPlan();
    if (!context.mounted) {
      return;
    }
    switch (answer) {
      case PlannedEvent():
        final String? confirmation = await showDialog<String>(
          context: context,
          builder: (BuildContext context) => DeletionDialog(plan: answer),
        );
        if (confirmation == null) {
          return;
        }
        await controller.delete(
          planId: answer.planId,
          confirmation: confirmation,
        );
      case NothingApprovedEvent():
        await showDialog<void>(
          context: context,
          builder: (BuildContext context) =>
              NothingApprovedDialog(answer: answer),
        );
      default:
        return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final int selectedCount = state.selectedNumbers.length;
    return BottomAppBar(
      child: Row(
        children: [
          Text('$selectedCount selected'),
          const Spacer(),
          FilledButton(
            onPressed: selectedCount > 0
                ? () => _requestDeletion(context)
                : null,
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

class _NoticeText extends StatelessWidget {
  const _NoticeText({required this.notice});

  final String notice;

  @override
  Widget build(BuildContext context) {
    return SelectableText(
      notice,
      style: TextStyle(color: Theme.of(context).colorScheme.error),
    );
  }
}
