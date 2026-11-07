import 'package:flutter/widgets.dart';

import '../cleaner/cleaner.dart';
import 'delete_confirm_alert.dart';

/// "Clean safe items": selects the safe items, asks the bridge for their
/// plan, and opens the short alert on it.
Future<void> cleanSafeItems(
  BuildContext context,
  CleanerController controller,
) async {
  // The root navigator outlives the page that asked once the shell shows
  // Review.
  final NavigatorState rootNavigator = Navigator.of(context, rootNavigator: true);
  controller.selectSafeCandidates();
  await controller.requestPlan();
  if (!rootNavigator.mounted) {
    return;
  }
  final CleanerState state = controller.state;
  if (state is! ConfirmingState) {
    return;
  }
  await showDeleteConfirmAlert(
    context: rootNavigator.context,
    controller: controller,
    state: state,
    origin: DeleteAlertOrigin.cleanSafeItems,
  );
}
