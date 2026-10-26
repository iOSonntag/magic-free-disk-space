import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';

class CandidateTile extends StatelessWidget {
  const CandidateTile({
    super.key,
    required this.candidate,
    required this.isSelected,
    required this.onToggle,
  });

  final CandidateView candidate;
  final bool isSelected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final TextStyle? detailStyle = textTheme.bodySmall?.copyWith(
      color: Colors.grey,
    );
    return InkWell(
      onTap: onToggle,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Checkbox(value: isSelected, onChanged: (bool? _) => onToggle()),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          '${candidate.number}. ${candidate.title}',
                          style: textTheme.titleMedium,
                        ),
                      ),
                      const SizedBox(width: 8),
                      _RiskChip(risk: candidate.risk),
                    ],
                  ),
                  SelectableText(
                    candidate.path,
                    style: textTheme.bodySmall?.copyWith(fontFamily: 'Menlo'),
                  ),
                  const SizedBox(height: 4),
                  Text(candidate.explanation, style: detailStyle),
                  Text(candidate.regeneration, style: detailStyle),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Text(candidate.sizeText, style: textTheme.titleSmall),
          ],
        ),
      ),
    );
  }
}

class _RiskChip extends StatelessWidget {
  const _RiskChip({required this.risk});

  final Risk risk;

  @override
  Widget build(BuildContext context) {
    final Color color = switch (risk) {
      Risk.safe => Colors.green,
      Risk.review => Colors.amber,
      Risk.careful => Colors.red,
      Risk.never => Colors.grey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        risk.name,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}
