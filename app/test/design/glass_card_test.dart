import 'dart:ui';

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/cinematic_stage.dart';
import 'package:magic_free_disk_space/design/glass_card.dart';
import 'package:magic_free_disk_space/design/glyph_tile.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/section_look.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import 'support/design_harness.dart';

Widget buildStageWithCards(ValueNotifier<MotionState> windowMotion) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: SizedBox(
      width: 800,
      height: 600,
      child: CinematicStage(
        accent: SectionLook.caches.accent,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            GlassCard(
              accent: SectionLook.caches.accent,
              child: Row(
                children: <Widget>[
                  GlyphTile(glyph: SectionLook.caches.glyph, accent: SectionLook.caches.accent),
                  GlyphTile(glyph: SectionLook.trash.glyph, accent: SectionLook.trash.accent),
                ],
              ),
            ),
            const GlassCard(child: Text('Developer tools')),
          ],
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('each card blurs through one grouped backdrop filter of the stage', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildStageWithCards(windowMotion));

    final Finder filters = find.byType(BackdropFilter);
    expect(filters, findsNWidgets(2));

    final BackdropKey? stageKey = BackdropGroup.of(tester.element(find.byType(GlassCard).first))?.backdropKey;
    expect(stageKey, isNotNull);
    for (final Element filter in filters.evaluate()) {
      final BackdropFilter widget = filter.widget as BackdropFilter;
      final RenderBackdropFilter render = filter.renderObject! as RenderBackdropFilter;
      expect(render.backdropKey, stageKey);
      expect(widget.filter, ImageFilter.blur(sigmaX: GlassTokens.blurSigma, sigmaY: GlassTokens.blurSigma));
    }
  });

  testWidgets('glyph tiles add no blur of their own', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildStageWithCards(windowMotion));

    expect(find.descendant(of: find.byType(GlyphTile), matching: find.byType(BackdropFilter)), findsNothing);
  });

  testWidgets('a glyph tile draws its glyph from the bundled symbols, filled', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildStageWithCards(windowMotion));

    final Icon glyph = tester.widget<Icon>(find.byType(Icon).first);
    expect(glyph.icon, SectionLook.caches.glyph);
    expect(glyph.fill, 1);
  });
}
