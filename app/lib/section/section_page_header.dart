import 'package:flutter/widgets.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';

/// The head of a section's page: its tile, which flew in from the Overview,
/// its title, and what it holds. It sweeps while [isScanning].
class SectionPageHeader extends StatelessWidget {
  const SectionPageHeader({
    super.key,
    required this.sectionKey,
    required this.title,
    required this.total,
    required this.isScanning,
  });

  final SectionKey sectionKey;
  final String title;
  final SectionTotal? total;
  final bool isScanning;

  @override
  Widget build(BuildContext context) {
    final SectionTotal? total = this.total;
    final SectionLook look = sectionKeyToLook(sectionKey);
    return Padding(
      padding: const EdgeInsets.only(bottom: StageSpacing.large),
      child: ScanSweep(
        isSweeping: isScanning,
        accent: look.accent,
        child: Row(
          children: [
            SectionHeroTile(look: look, size: 64),
            const SizedBox(width: StageSpacing.large - 4),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: TypeRamp.headline),
                  const SizedBox(height: StageSpacing.tight),
                  Text(
                    total == null
                        ? 'Nothing found here yet'
                        : '${formatBytes(total.allocatedBytes)} · ${formatSectionCountText(total)}',
                    style: TypeRamp.body,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
