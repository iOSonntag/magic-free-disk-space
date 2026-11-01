import 'package:flutter/material.dart';

import '../bridge/bridge_event.dart';
import 'text_styles.dart';

/// A selectable item, ticked by a tap anywhere on it.
class ItemTile extends StatelessWidget {
  const ItemTile({
    super.key,
    required this.item,
    required this.isSelected,
    required this.onToggle,
  });

  final ItemView item;
  final bool isSelected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onToggle,
      child: _ItemRow(
        leading: Checkbox(
          value: isSelected,
          onChanged: (bool? _) => onToggle(),
        ),
        titleText: '${item.number}. ${item.title}',
        risk: item.risk,
        riskText: item.riskText,
        sizeText: item.sizeText,
        detailLines: item.detailLines,
      ),
    );
  }
}

/// An item the tool never removes, shown without a checkbox.
class AdviceTile extends StatelessWidget {
  const AdviceTile({super.key, required this.item});

  final AdviceItemView item;

  @override
  Widget build(BuildContext context) {
    return _ItemRow(
      leading: null,
      titleText: item.title,
      risk: item.risk,
      riskText: item.riskText,
      sizeText: item.sizeText,
      detailLines: item.detailLines,
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({
    required this.leading,
    required this.titleText,
    required this.risk,
    required this.riskText,
    required this.sizeText,
    required this.detailLines,
  });

  final Widget? leading;
  final String titleText;
  final Risk risk;
  final String riskText;
  final String sizeText;
  final List<ItemDetailLine> detailLines;

  @override
  Widget build(BuildContext context) {
    final Widget? leading = this.leading;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (leading != null) ...[leading, const SizedBox(width: 8)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        titleText,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ),
                    const SizedBox(width: 8),
                    _RiskChip(risk: risk, riskText: riskText),
                  ],
                ),
                const SizedBox(height: 4),
                for (final ItemDetailLine line in detailLines)
                  _DetailLineText(line: line),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(sizeText, style: Theme.of(context).textTheme.titleSmall),
        ],
      ),
    );
  }
}

class _DetailLineText extends StatelessWidget {
  const _DetailLineText({required this.line});

  final ItemDetailLine line;

  @override
  Widget build(BuildContext context) {
    final TextStyle? detailStyle = Theme.of(context).textTheme.bodySmall
        ?.copyWith(color: Colors.grey);
    return switch (line.kind) {
      ItemDetailLineKind.path => SelectableText(
        line.text,
        style: monospaceStyle,
      ),
      ItemDetailLineKind.explanation ||
      ItemDetailLineKind.regeneration => Text(line.text, style: detailStyle),
      ItemDetailLineKind.evidence => _MarkedLine(
        marker: Text('•', style: detailStyle),
        text: Text(line.text, style: detailStyle),
      ),
      ItemDetailLineKind.command => _MarkedLine(
        marker: const Icon(Icons.terminal, size: 14),
        text: SelectableText(line.text, style: monospaceStyle),
      ),
      ItemDetailLineKind.advice => _MarkedLine(
        marker: const Icon(Icons.lightbulb_outline, size: 14),
        text: Text(line.text, style: Theme.of(context).textTheme.bodySmall),
      ),
    };
  }
}

class _MarkedLine extends StatelessWidget {
  const _MarkedLine({required this.marker, required this.text});

  final Widget marker;
  final Widget text;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        marker,
        const SizedBox(width: 6),
        Expanded(child: text),
      ],
    );
  }
}

class _RiskChip extends StatelessWidget {
  const _RiskChip({required this.risk, required this.riskText});

  final Risk risk;
  final String riskText;

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
        riskText,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(color: color),
      ),
    );
  }
}
