import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';

/// The word the bridge demands for every deletion; the app sends it on the
/// alert's Delete, and a plan with a careful item asks the user to type it.
const String deleteConfirmationWord = 'DELETE';

/// Shows the alert that confirms the plan of [state], and acts on
/// [controller]: Delete deletes the plan, Cancel cancels it, and "Show list",
/// offered when [canShowList], closes the alert and leaves the plan for the
/// Review page. Completes once the alert is closed.
Future<void> showDeleteConfirmAlert({
  required BuildContext context,
  required CleanerController controller,
  required ConfirmingState state,
  required bool canShowList,
}) async {}
