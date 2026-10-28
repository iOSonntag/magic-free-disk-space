import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import 'text_styles.dart';

/// Shows the plan with its warning and asks for the confirmation word; Delete
/// and Enter send the typed text.
class ConfirmationView extends StatefulWidget {
  const ConfirmationView({
    super.key,
    required this.plan,
    required this.onConfirm,
    required this.onCancel,
  });

  final PlannedEvent plan;
  final void Function(String confirmation) onConfirm;
  final VoidCallback onCancel;

  @override
  State<ConfirmationView> createState() => _ConfirmationViewState();
}

class _ConfirmationViewState extends State<ConfirmationView> {
  final TextEditingController _confirmationController = TextEditingController();

  @override
  void dispose() {
    _confirmationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme colors = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Delete permanently',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 12),
        SelectableText(widget.plan.lines.join('\n'), style: monospaceStyle),
        const SizedBox(height: 16),
        Text(widget.plan.warningLines.join('\n')),
        const SizedBox(height: 8),
        TextField(
          controller: _confirmationController,
          autofocus: true,
          autocorrect: false,
          onSubmitted: widget.onConfirm,
        ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            TextButton(onPressed: widget.onCancel, child: const Text('Cancel')),
            const SizedBox(width: 8),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: colors.error,
                foregroundColor: colors.onError,
              ),
              onPressed: () => widget.onConfirm(_confirmationController.text),
              child: const Text('Delete'),
            ),
          ],
        ),
      ],
    );
  }
}
