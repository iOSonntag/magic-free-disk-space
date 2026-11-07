import 'package:flutter/material.dart';

import '../design/design.dart';
import '../update/update.dart';

const String updateCheckItemText = 'Look for updates at start';

/// The switch of the update check as it shows.
final class UpdateCheckSwitchLook {
  const UpdateCheckSwitchLook({required this.isOn, required this.isEnabled});

  final bool isOn;

  /// Whether a tap may change it.
  final bool isEnabled;
}

UpdateCheckSwitchLook buildUpdateCheckSwitchLook(
  UpdateCheckSwitch updateCheckSwitch,
) {
  return switch (updateCheckSwitch) {
    UpdateCheckSwitchLoading() || UpdateCheckSwitchUnavailable() =>
      const UpdateCheckSwitchLook(isOn: false, isEnabled: false),
    UpdateCheckSwitchSaving(:final bool isEnabled) => UpdateCheckSwitchLook(
      isOn: isEnabled,
      isEnabled: false,
    ),
    UpdateCheckSwitchConfirmed(:final bool isEnabled) => UpdateCheckSwitchLook(
      isOn: isEnabled,
      isEnabled: true,
    ),
  };
}

/// The settings: the update check at start, and the licences of the fonts
/// and the framework.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key, required this.updateController});

  final UpdateController updateController;

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
              return _UpdateCheckSetting(controller: updateController);
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

class _UpdateCheckSetting extends StatelessWidget {
  const _UpdateCheckSetting({required this.controller});

  final UpdateController controller;

  @override
  Widget build(BuildContext context) {
    final UpdateCheckSwitchLook look = buildUpdateCheckSwitchLook(
      controller.updateCheckSwitch,
    );
    final String? saveFailureText = controller.saveFailureText;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          container: true,
          toggled: look.isOn,
          enabled: look.isEnabled,
          label: updateCheckItemText,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: look.isEnabled
                  ? () => controller.setUpdateCheck(!look.isOn)
                  : null,
              borderRadius: BorderRadius.circular(GlassTokens.tileRadius),
              child: ExcludeSemantics(
                child: Padding(
                  padding: const EdgeInsets.all(StageSpacing.tight),
                  child: Row(
                    children: [
                      const GlyphTile(
                        glyph: AppIcons.update,
                        accent: StageColors.overviewAccent,
                        size: 40,
                      ),
                      const SizedBox(width: StageSpacing.regular),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(updateCheckItemText, style: TypeRamp.title),
                            const SizedBox(height: StageSpacing.tight),
                            Text(
                              'Asks GitHub for a newer release each time the app starts.',
                              style: TypeRamp.body,
                            ),
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
