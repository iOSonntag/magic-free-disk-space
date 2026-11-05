import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/app_icons.dart';
import 'package:magic_free_disk_space/design/section_look.dart';
import 'package:magic_free_disk_space/design/type_ramp.dart';

final List<TextStyle> rampStyles = <TextStyle>[
  TypeRamp.display,
  TypeRamp.headline,
  TypeRamp.title,
  TypeRamp.figure,
  TypeRamp.body,
  TypeRamp.label,
  TypeRamp.caption,
  TypeRamp.overline,
];

double? findAxisValue(TextStyle style, String axis) {
  for (final FontVariation variation in style.fontVariations ?? const <FontVariation>[]) {
    if (variation.axis == axis) {
      return variation.value;
    }
  }

  return null;
}

void main() {
  test('every section has its own accent and a glyph of the bundled symbols', () {
    final Set<Color> accents = SectionLook.values.map((SectionLook look) => look.accent).toSet();

    expect(accents, hasLength(SectionLook.values.length));
    for (final SectionLook look in SectionLook.values) {
      expect(look.glyph.fontFamily, AppIcons.fontFamily, reason: look.name);
    }
  });

  test('every style of the ramp is Inter with its weight on the wght axis', () {
    for (final TextStyle style in rampStyles) {
      expect(style.fontFamily, TypeRamp.fontFamily);
      expect(findAxisValue(style, 'wght'), style.fontWeight!.value.toDouble());
      expect(findAxisValue(style, 'opsz'), inInclusiveRange(14, 32));
    }
  });
}
