import 'package:flutter/widgets.dart';

import '../cleaner/cleaner.dart';
import '../link/link.dart';
import 'deleted_page.dart';
import 'deleting_view.dart';
import 'review_page.dart';

/// The step of the delete flow that [state] shows over the pages: Review
/// while its plan waits for its confirmation, Deleting, then the result.
class RemovalFlowStep extends StatelessWidget {
  const RemovalFlowStep({
    super.key,
    required this.state,
    required this.controller,
    required this.urlOpener,
  });

  final RemovalFlowState state;
  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      final ConfirmingState confirming => ReviewPage(
        state: confirming,
        controller: controller,
      ),
      final DeletingState deleting => DeletingView(state: deleting),
      final DeletedState deleted => DeletedPage(
        state: deleted,
        controller: controller,
        urlOpener: urlOpener,
      ),
    };
  }
}
