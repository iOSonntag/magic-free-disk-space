import 'package:flutter/widgets.dart';

import '../bridge/bridge_event.dart';
import '../bridge/openable_url.dart';
import '../design/section_look.dart';
import '../design/tokens.dart';
import '../design/type_ramp.dart';
import '../link/url_opener.dart';
import '../section/advice_card.dart';

/// A place that only a pane of System Settings frees, with no folder the
/// scan could measure.
typedef SettingsPlace = ({String title, String step, SettingsPane pane});

/// The places of System Settings, in the order the page shows them.
const List<SettingsPlace> settingsPlaces = [
  (
    title: 'Everything on this Mac, by kind',
    step:
        'macOS shows what takes space, such as apps, documents and system '
        'data, and offers its own clean-ups for them.',
    pane: SettingsPane.storage,
  ),
  (
    title: 'Keep only recent files on this Mac',
    step:
        'With Optimize Mac Storage on, iCloud Drive keeps older files only '
        'online and downloads them again when you open them. Turn it on '
        'under iCloud Drive.',
    pane: SettingsPane.icloud,
  ),
  (
    title: 'Time Machine snapshots',
    step:
        'macOS keeps local snapshots between backups and removes them on its '
        'own when the disk runs low. This app never deletes them.',
    pane: SettingsPane.timeMachine,
  ),
];

/// The cards of [settingsPlaces], under their heading, each with a button
/// that opens its pane.
class SettingsPlaceCards extends StatelessWidget {
  const SettingsPlaceCards({
    super.key,
    required this.look,
    required this.urlOpener,
  });

  final SectionLook look;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(
            top: StageSpacing.regular,
            bottom: StageSpacing.medium,
          ),
          child: Text('IN SYSTEM SETTINGS', style: TypeRamp.overline),
        ),
        for (final SettingsPlace place in settingsPlaces)
          Padding(
            padding: const EdgeInsets.only(bottom: StageSpacing.regular),
            child: AdvicePlaceCard(
              key: ValueKey<SettingsPane>(place.pane),
              title: place.title,
              allocatedBytes: 0,
              displayPath: null,
              details: Text(place.step, style: TypeRamp.body),
              target: findAdviceOpenerTarget(SettingsOpener(pane: place.pane)),
              revealUrl: null,
              accent: look.accent,
              fallbackGlyph: look.glyph,
              urlOpener: urlOpener,
            ),
          ),
      ],
    );
  }
}
