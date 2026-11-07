import 'package:flutter/material.dart';

import '../design/design.dart';
import 'accent_button.dart';
import 'size_ease.dart';

/// A "Details" toggle that unfolds [lines], the bridge's own text of a plan
/// or a run.
class LinesDetails extends StatefulWidget {
  const LinesDetails({super.key, required this.lines});

  final List<String> lines;

  @override
  State<LinesDetails> createState() => _LinesDetailsState();
}

class _LinesDetailsState extends State<LinesDetails> {
  bool _isOpen = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          expanded: _isOpen,
          child: QuietButton(
            label: 'Details',
            icon: _isOpen ? AppIcons.collapse : AppIcons.expand,
            onPressed: () => setState(() => _isOpen = !_isOpen),
          ),
        ),
        SizeEase(
          child: _isOpen
              ? Padding(
                  padding: const EdgeInsets.only(top: StageSpacing.small),
                  child: SizedBox(
                    width: double.infinity,
                    child: GlassCard(
                      padding: const EdgeInsets.all(StageSpacing.regular),
                      child: SelectableText(
                        widget.lines.join('\n'),
                        style: TypeRamp.caption.copyWith(
                          color: StageColors.textSecondary,
                          height: 1.6,
                        ),
                      ),
                    ),
                  ),
                )
              : const SizedBox(width: double.infinity),
        ),
      ],
    );
  }
}
