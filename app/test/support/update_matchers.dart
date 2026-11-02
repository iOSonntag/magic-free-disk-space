import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

/// Matches the switch state the bridge confirmed with [isEnabled].
Matcher isConfirmedSwitch({required bool isEnabled}) {
  return isA<UpdateCheckSwitchConfirmed>().having(
    (confirmed) => confirmed.isEnabled,
    'isEnabled',
    isEnabled,
  );
}
