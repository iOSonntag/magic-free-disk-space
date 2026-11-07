import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';

final TextStyle _codeStyle = TypeRamp.caption.copyWith(
  fontFamily: 'Menlo',
  fontFamilyFallback: const ['Courier'],
  color: StageColors.textPrimary,
  height: 1.5,
);

/// The path an item is found at, in a code face.
class ItemPathText extends StatelessWidget {
  const ItemPathText({super.key, required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    return Text(path, style: _codeStyle.copyWith(color: StageColors.textSecondary));
  }
}

/// The bridge's lines on an item, each in the look of its kind. A path line
/// is left out: the caller shows the item's display path instead.
class ItemDetailLines extends StatelessWidget {
  const ItemDetailLines({super.key, required this.lines, required this.accent});

  final List<ItemDetailLine> lines;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final ItemDetailLine line in lines)
          if (line.kind != ItemDetailLineKind.path)
            Padding(
              padding: const EdgeInsets.only(bottom: StageSpacing.small),
              child: _ItemDetailLine(line: line, accent: accent),
            ),
      ],
    );
  }
}

class _ItemDetailLine extends StatelessWidget {
  const _ItemDetailLine({required this.line, required this.accent});

  final ItemDetailLine line;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    return switch (line.kind) {
      ItemDetailLineKind.explanation ||
      ItemDetailLineKind.regeneration ||
      ItemDetailLineKind.path => Text(line.text, style: TypeRamp.body),
      ItemDetailLineKind.evidence => _MarkedLine(
        marker: Container(
          width: 5,
          height: 5,
          margin: const EdgeInsets.only(top: 7),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: accent.withValues(alpha: 0.8),
          ),
        ),
        text: Text(line.text, style: TypeRamp.body),
      ),
      ItemDetailLineKind.command => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(
          horizontal: StageSpacing.medium,
          vertical: StageSpacing.small,
        ),
        decoration: BoxDecoration(
          color: StageColors.nightDeep.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: GlassTokens.rimShade),
        ),
        child: Text(line.text, style: _codeStyle),
      ),
      ItemDetailLineKind.advice => _MarkedLine(
        marker: Icon(AppIcons.info, size: 16, color: accent),
        text: Text(
          line.text,
          style: TypeRamp.body.copyWith(color: StageColors.textPrimary),
        ),
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
        SizedBox(width: 18, child: Center(child: marker)),
        const SizedBox(width: StageSpacing.small),
        Expanded(child: text),
      ],
    );
  }
}
