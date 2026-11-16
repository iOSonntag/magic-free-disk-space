import 'package:flutter/material.dart';

import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../update/update.dart';

const String updateCheckItemText = 'Look for updates at start';

const String rescanItemText = 'Scan again after deleting';

/// A switch of the settings as it shows.
final class SettingSwitchLook {
  const SettingSwitchLook({required this.isOn, required this.isEnabled});

  final bool isOn;

  /// Whether a tap may change it.
  final bool isEnabled;
}

SettingSwitchLook buildUpdateCheckSwitchLook(
  UpdateCheckSwitch updateCheckSwitch,
) {
  return switch (updateCheckSwitch) {
    UpdateCheckSwitchLoading() || UpdateCheckSwitchUnavailable() =>
      const SettingSwitchLook(isOn: false, isEnabled: false),
    UpdateCheckSwitchSaving(:final bool isEnabled) => SettingSwitchLook(
      isOn: isEnabled,
      isEnabled: false,
    ),
    UpdateCheckSwitchConfirmed(:final bool isEnabled) => SettingSwitchLook(
      isOn: isEnabled,
      isEnabled: true,
    ),
  };
}

/// The rescan switch shows on until the bridge answers, as the bridge
/// scans again unless told otherwise.
SettingSwitchLook buildRescanSwitchLook(RescanSwitch rescanSwitch) {
  return switch (rescanSwitch) {
    RescanSwitchLoading() || RescanSwitchUnavailable() =>
      const SettingSwitchLook(isOn: true, isEnabled: false),
    RescanSwitchSaving(:final bool isEnabled) => SettingSwitchLook(
      isOn: isEnabled,
      isEnabled: false,
    ),
    RescanSwitchConfirmed(:final bool isEnabled) => SettingSwitchLook(
      isOn: isEnabled,
      isEnabled: true,
    ),
  };
}

/// The settings: the update check at start, the scan after a deletion, and
/// the licences of the fonts and the framework.
class SettingsPage extends StatelessWidget {
  const SettingsPage({
    super.key,
    required this.updateController,
    required this.cleanerController,
  });

  final UpdateController updateController;
  final CleanerController cleanerController;

  @override
  Widget build(BuildContext context) {
    return StagePageScroll(
      children: [
        Text('Settings', style: TypeRamp.headline),
        const SizedBox(height: StageSpacing.large),
        GlassCard(
          accent: StageColors.overviewAccent,
          child: ListenableBuilder(
            listenable: updateController,
            builder: (BuildContext context, Widget? _) {
              return _SwitchSetting(
                titleText: updateCheckItemText,
                bodyText:
                    'Asks GitHub for a newer release each time the app starts.',
                glyph: AppIcons.update,
                look: buildUpdateCheckSwitchLook(
                  updateController.updateCheckSwitch,
                ),
                saveFailureText: updateController.saveFailureText,
                onChanged: updateController.setUpdateCheck,
              );
            },
          ),
        ),
        const SizedBox(height: StageSpacing.regular),
        GlassCard(
          accent: StageColors.overviewAccent,
          child: ListenableBuilder(
            listenable: cleanerController,
            builder: (BuildContext context, Widget? _) {
              return _SwitchSetting(
                titleText: rescanItemText,
                bodyText:
                    'Scans anew once you close the result of a deletion. '
                    'When off, the list drops what was deleted, and "Scan '
                    'again" scans when you ask.',
                glyph: AppIcons.scanAgain,
                look: buildRescanSwitchLook(cleanerController.rescanSwitch),
                saveFailureText: cleanerController.rescanSaveFailureText,
                onChanged: cleanerController.setRescanAfterDeletion,
              );
            },
          ),
        ),
        const SizedBox(height: StageSpacing.regular),
        GlassCard(
          child: Row(
            children: [
              const GlyphTile(
                glyph: AppIcons.info,
                accent: StageColors.textSecondary,
                size: 40,
              ),
              const SizedBox(width: StageSpacing.regular),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('About', style: TypeRamp.title),
                    const SizedBox(height: StageSpacing.tight),
                    Text(
                      'Sizes are shown in decimal units, as Finder shows them. '
                      'Motion follows Reduce Motion in System Settings.',
                      style: TypeRamp.body,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: StageSpacing.regular),
              StageButton(
                label: 'Licences',
                onPressed: () {
                  showLicensePage(
                    context: context,
                    applicationName: 'Magic Free Disk Space',
                  );
                },
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// One switch of the settings: a row a tap toggles, with the reason a save
/// failed below it.
class _SwitchSetting extends StatelessWidget {
  const _SwitchSetting({
    required this.titleText,
    required this.bodyText,
    required this.glyph,
    required this.look,
    required this.saveFailureText,
    required this.onChanged,
  });

  final String titleText;
  final String bodyText;
  final IconData glyph;
  final SettingSwitchLook look;
  final String? saveFailureText;
  final Future<void> Function(bool isOn) onChanged;

  @override
  Widget build(BuildContext context) {
    final String? saveFailureText = this.saveFailureText;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          toggled: look.isOn,
          enabled: look.isEnabled,
          label: titleText,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: look.isEnabled ? () => onChanged(!look.isOn) : null,
              borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
              child: ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsets.all(StageSpacing.tight),
                  child: Row(
                    children: [
                      GlyphTile(
                        glyph: glyph,
                        accent: StageColors.overviewAccent,
                        size: 40,
                      ),
                      const SizedBox(width: StageSpacing.regular),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(titleText, style: TypeRamp.title),
                            const SizedBox(height: StageSpacing.tight),
                            Text(bodyText, style: TypeRamp.body),
                          ],
                        ),
                      ),
                      const SizedBox(width: StageSpacing.regular),
                      StageSwitchTrack(value: look.isOn, enabled: look.isEnabled),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        if (saveFailureText != null) ...[
          const SizedBox(height: StageSpacing.small),
          Text(
            saveFailureText,
            style: TypeRamp.caption.copyWith(color: StageColors.careful),
          ),
        ],
      ],
    );
  }
}
