import 'package:flutter/widgets.dart';

import 'glyph_tile.dart';
import 'section_look.dart';

/// The hero tag of a section's glyph tile: its Overview card's tile flies
/// into the header of its page.
@immutable
final class SectionHeroTag {
  const SectionHeroTag(this.look);

  final SectionLook look;

  @override
  bool operator ==(Object other) {
    return other is SectionHeroTag && other.look == look;
  }

  @override
  int get hashCode {
    return Object.hash(SectionHeroTag, look);
  }
}

/// The glyph tile of the section of [look] at [size], which flies between
/// the pages that show it. It scales in flight rather than reflowing.
class SectionHeroTile extends StatelessWidget {
  const SectionHeroTile({
    super.key,
    required this.look,
    required this.size,
  });

  final SectionLook look;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox.square(
      dimension: size,
      child: Hero(
        tag: SectionHeroTag(look),
        child: FittedBox(
          child: GlyphTile(glyph: look.glyph, accent: look.accent, size: size),
        ),
      ),
    );
  }
}
