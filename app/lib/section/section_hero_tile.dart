import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../design/glyph_tile.dart';
import '../design/section_look.dart';
import 'section_labels.dart';

/// The hero tag of a section's glyph tile: its Overview card's tile flies
/// into the header of its page.
@immutable
final class SectionHeroTag {
  const SectionHeroTag(this.sectionKey);

  final SectionKey sectionKey;

  @override
  bool operator ==(Object other) {
    return other is SectionHeroTag && other.sectionKey == sectionKey;
  }

  @override
  int get hashCode {
    return Object.hash(SectionHeroTag, sectionKey);
  }
}

/// The glyph tile of [sectionKey] at [size], which flies between the pages
/// that show it. It scales in flight rather than reflowing.
class SectionHeroTile extends StatelessWidget {
  const SectionHeroTile({
    super.key,
    required this.sectionKey,
    required this.size,
  });

  final SectionKey sectionKey;
  final double size;

  @override
  Widget build(BuildContext context) {
    final SectionLook look = sectionKeyToLook(sectionKey);
    return SizedBox.square(
      dimension: size,
      child: Hero(
        tag: SectionHeroTag(sectionKey),
        child: FittedBox(
          child: GlyphTile(glyph: look.glyph, accent: look.accent, size: size),
        ),
      ),
    );
  }
}
