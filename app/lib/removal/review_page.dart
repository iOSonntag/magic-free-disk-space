import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';

/// The Review step: lists what the plan of [state] deletes, and opens the
/// delete alert from its "Delete" button. The shell shows it for every
/// [ConfirmingState].
class ReviewPage extends StatelessWidget {
  const ReviewPage({super.key, required this.state, required this.controller});

  final ConfirmingState state;
  final CleanerController controller;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
