import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';

const double sectionCardWidth = 236;

/// The key of the Overview's card of the section keyed [value].
final class SectionCardKey extends ValueKey<SectionKey> {
  const SectionCardKey(super.value);
}

/// A section on the Overview: its glyph tile, title, figure and count. It
/// lands with a rise and a fade when a scan first finds it, and sweeps while
/// [isScanning].
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    required this.total,
    required this.isScanning,
    required this.onPressed,
  });

  final SectionTotal total;
  final bool isScanning;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final SectionLook look = sectionKeyToLook(total.sectionKey);
    final String countText = formatSectionCountText(total);
    final TextStyle figureStyle = TypeRamp.figure.copyWith(fontSize: 22, color: look.accent);
    final bool isReduced = MotionScope.of(context).isReduced;
    return TweenAnimationBuilder<double>(
      tween: Tween<double>(begin: 0, end: 1),
      duration: isReduced ? Duration.zero : MotionTokens.countUp,
      curve: MotionTokens.countUpCurve,
      builder: (BuildContext context, double landed, Widget? child) {
        return Opacity(
          opacity: landed,
          child: Transform.translate(
            offset: Offset(0, (1 - landed) * 18),
            child: child,
          ),
        );
      },
      child: SizedBox(
        width: sectionCardWidth,
        child: GlassCardButton(
          accent: look.accent,
          semanticsLabel: '${total.titleText}, ${formatSectionFigureText(total)}, $countText',
          onPressed: onPressed,
          child: ScanSweep(
            isSweeping: isScanning,
            accent: look.accent,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionHeroTile(look: look, size: 44),
                    const Spacer(),
                    const Icon(
                      AppIcons.forward,
                      size: 20,
                      color: StageColors.textTertiary,
                    ),
                  ],
                ),
                const SizedBox(height: StageSpacing.regular),
                Text(
                  total.titleText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeRamp.title,
                ),
                const SizedBox(height: StageSpacing.tight),
                if (total.itemCount > 0)
                  CountUp(
                    value: total.allocatedBytes,
                    format: (int allocatedBytes) => formatSizeText(
                      allocatedBytes: allocatedBytes,
                      isComplete: total.isComplete,
                    ),
                    style: figureStyle,
                  )
                else
                  Text(formatSectionFigureText(total), style: figureStyle),
                const SizedBox(height: 2),
                Text(
                  countText,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TypeRamp.caption,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
