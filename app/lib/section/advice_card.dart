import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../design/design.dart';
import '../link/link.dart';
import '../scan_view/scan_view.dart';
import 'item_detail_lines.dart';
import 'reveal_in_finder_button.dart';

/// The app or settings pane an advice opens: its name, its glyph and its
/// URL.
final class AdviceOpenerTarget {
  const AdviceOpenerTarget({
    required this.name,
    required this.glyph,
    required this.url,
  });

  final String name;
  final IconData glyph;
  final OpenableUrl url;
}

/// The target of [opener], or `null` when this app does not know the app or
/// pane it names.
AdviceOpenerTarget? findAdviceOpenerTarget(AdviceOpener opener) {
  switch (opener) {
    case AppOpener(:final OpenableApp app):
      final OpenAppUrl? url = OpenAppUrl.forApp(app);
      final ({String name, IconData glyph})? appLook = _findAppLook(app);
      if (url == null || appLook == null) {
        return null;
      }
      return AdviceOpenerTarget(name: appLook.name, glyph: appLook.glyph, url: url);
    case SettingsOpener(:final SettingsPane pane):
      final SettingsPaneUrl? url = SettingsPaneUrl.forPane(pane);
      final ({String name, IconData glyph})? paneLook = _findPaneLook(pane);
      if (url == null || paneLook == null) {
        return null;
      }
      return AdviceOpenerTarget(name: paneLook.name, glyph: paneLook.glyph, url: url);
  }
}

({String name, IconData glyph})? _findAppLook(OpenableApp app) {
  return switch (app) {
    OpenableApp.photos => (name: 'Photos', glyph: AppIcons.photos),
    OpenableApp.messages => (name: 'Messages', glyph: AppIcons.messages),
    OpenableApp.music => (name: 'Music', glyph: AppIcons.music),
    OpenableApp.tv => (name: 'TV', glyph: AppIcons.tv),
    OpenableApp.podcasts => (name: 'Podcasts', glyph: AppIcons.podcasts),
    OpenableApp.garageBand => (name: 'GarageBand', glyph: AppIcons.garageBand),
    OpenableApp.logicPro => (name: 'Logic Pro', glyph: AppIcons.logicPro),
    OpenableApp.iMovie => (name: 'iMovie', glyph: AppIcons.iMovie),
    OpenableApp.finalCutPro => (name: 'Final Cut Pro', glyph: AppIcons.finalCutPro),
    OpenableApp.finder => (name: 'Finder', glyph: AppIcons.finder),
    OpenableApp.unknown => null,
  };
}

({String name, IconData glyph})? _findPaneLook(SettingsPane pane) {
  return switch (pane) {
    SettingsPane.storage => (name: 'Storage settings', glyph: AppIcons.storageSettings),
    SettingsPane.icloud => (name: 'iCloud settings', glyph: AppIcons.icloudSettings),
    SettingsPane.timeMachine => (
      name: 'Time Machine settings',
      glyph: AppIcons.timeMachineSettings,
    ),
    SettingsPane.unknown => null,
  };
}

/// The key of the card of the advice keyed [value].
final class AdviceCardKey extends ValueKey<String> {
  const AdviceCardKey(super.value);
}

/// A place only the user can free: what it holds, the steps, and a button
/// that opens its app or settings pane. It has no checkbox; nothing selects
/// it.
class AdviceCard extends StatelessWidget {
  const AdviceCard({
    super.key,
    required this.item,
    required this.look,
    required this.revealPaths,
    required this.urlOpener,
    required this.now,
  });

  final AdviceItemView item;
  final SectionLook look;
  final Set<String> revealPaths;
  final UrlOpener urlOpener;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final AdviceOpener? opener = item.opener;
    return AdvicePlaceCard(
      title: item.title,
      factsText: formatAdviceFactsText(item, now: now),
      sizeText: item.allocatedBytes > 0
          ? formatSizeText(allocatedBytes: item.allocatedBytes, isComplete: item.isComplete)
          : null,
      displayPath: item.displayPath,
      details: ItemDetailLines(lines: item.detailLines, accent: look.accent),
      target: opener == null ? null : findAdviceOpenerTarget(opener),
      revealUrl: RevealUrl.tryParse(item.revealPath, allowedPaths: revealPaths),
      look: look,
      urlOpener: urlOpener,
    );
  }
}

/// The card of a place only the user can free, with [details] on how and a
/// button for [target] and for [revealUrl] where they are set.
class AdvicePlaceCard extends StatelessWidget {
  const AdvicePlaceCard({
    super.key,
    required this.title,
    required this.factsText,
    required this.sizeText,
    required this.displayPath,
    required this.details,
    required this.target,
    required this.revealUrl,
    required this.look,
    required this.urlOpener,
  });

  final String title;

  /// Shown when not empty.
  final String factsText;

  /// `null` for a place no scan measured.
  final String? sizeText;
  final String? displayPath;
  final Widget details;
  final AdviceOpenerTarget? target;
  final RevealUrl? revealUrl;
  final SectionLook look;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    final AdviceOpenerTarget? target = this.target;
    final String? sizeText = this.sizeText;
    final String? displayPath = this.displayPath;
    final RevealUrl? revealUrl = this.revealUrl;
    final Color accent = look.accent;
    return GlassCard(
      accent: accent,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GlyphTile(glyph: target?.glyph ?? look.glyph, accent: accent),
          const SizedBox(width: StageSpacing.regular),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(title, style: TypeRamp.title)),
                    if (sizeText != null) ...[
                      const SizedBox(width: StageSpacing.regular),
                      Text(sizeText, style: TypeRamp.figure),
                    ],
                  ],
                ),
                if (factsText.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(factsText, style: TypeRamp.caption),
                ],
                if (displayPath != null) ...[
                  const SizedBox(height: StageSpacing.tight),
                  ItemPathText(path: displayPath),
                ],
                const SizedBox(height: StageSpacing.medium),
                details,
                if (target != null || revealUrl != null) ...[
                  const SizedBox(height: StageSpacing.small),
                  Wrap(
                    spacing: StageSpacing.small,
                    runSpacing: StageSpacing.small,
                    children: [
                      if (target != null)
                        OpenUrlButton(
                          labelText: 'Open ${target.name}',
                          url: target.url,
                          failedText: '${target.name} did not open.',
                          urlOpener: urlOpener,
                          icon: target.glyph,
                          accent: accent,
                        ),
                      if (revealUrl != null)
                        RevealInFinderButton(
                          url: revealUrl,
                          urlOpener: urlOpener,
                          accent: accent,
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
