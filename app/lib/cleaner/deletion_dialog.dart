import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';

const TextStyle monospaceStyle = TextStyle(fontFamily: 'Menlo', fontSize: 12);

/// Pops with the typed text when the user presses Delete, or with null on
/// Cancel.
class DeletionDialog extends StatefulWidget {
  const DeletionDialog({super.key, required this.plan});

  final PlannedEvent plan;

  @override
  State<DeletionDialog> createState() => _DeletionDialogState();
}

class _DeletionDialogState extends State<DeletionDialog> {
  final TextEditingController _confirmationController = TextEditingController();

  @override
  void dispose() {
    _confirmationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme colors = Theme.of(context).colorScheme;
    return AlertDialog(
      title: const Text('Delete permanently'),
      content: SizedBox(
        width: 600,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SelectableText(
                widget.plan.lines.join('\n'),
                style: monospaceStyle,
              ),
              const SizedBox(height: 16),
              Text(
                'This cannot be undone: the items do not go to the Trash. '
                'Type ${widget.plan.confirmationWord} to delete them '
                'permanently.',
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _confirmationController,
                autofocus: true,
                autocorrect: false,
                onSubmitted: (String confirmation) =>
                    Navigator.of(context).pop(confirmation),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: colors.error,
            foregroundColor: colors.onError,
          ),
          onPressed: () =>
              Navigator.of(context).pop(_confirmationController.text),
          child: const Text('Delete'),
        ),
      ],
    );
  }
}

class NothingApprovedDialog extends StatelessWidget {
  const NothingApprovedDialog({super.key, required this.answer});

  final NothingApprovedEvent answer;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nothing to delete'),
      content: SizedBox(
        width: 600,
        child: SingleChildScrollView(
          child: SelectableText(answer.lines.join('\n'), style: monospaceStyle),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }
}
