import 'package:flutter/material.dart';

import 'update_controller.dart';

const String updateCheckItemText = 'Look for updates at start';

/// The app bar menu with the switch of the update check; the item is
/// disabled while the check loads, a save runs, or the bridge cannot store
/// it.
class UpdateCheckMenu extends StatelessWidget {
  const UpdateCheckMenu({super.key, required this.controller});

  final UpdateController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) {
        final UpdateCheckSwitch updateCheckSwitch =
            controller.updateCheckSwitch;
        final ({bool isChecked, bool isEnabled}) item =
            switch (updateCheckSwitch) {
              UpdateCheckSwitchLoading() || UpdateCheckSwitchUnavailable() => (
                isChecked: false,
                isEnabled: false,
              ),
              UpdateCheckSwitchSaving() => (
                isChecked: updateCheckSwitch.isEnabled,
                isEnabled: false,
              ),
              UpdateCheckSwitchEnabled() => (isChecked: true, isEnabled: true),
              UpdateCheckSwitchDisabled() => (
                isChecked: false,
                isEnabled: true,
              ),
            };
        return PopupMenuButton<bool>(
          tooltip: 'Settings',
          onSelected: controller.setUpdateCheck,
          itemBuilder: (BuildContext context) => [
            CheckedPopupMenuItem<bool>(
              value: !item.isChecked,
              checked: item.isChecked,
              enabled: item.isEnabled,
              child: const Text(updateCheckItemText),
            ),
          ],
        );
      },
    );
  }
}
