import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';
import '../link/url_opener.dart';

/// The Result step: what the run of [state] freed and kept, its details, and
/// its log, which [urlOpener] shows in Finder. The shell shows it for every
/// [DeletedState].
class DeletedPage extends StatelessWidget {
  const DeletedPage({
    super.key,
    required this.state,
    required this.controller,
    required this.urlOpener,
  });

  final DeletedState state;
  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
