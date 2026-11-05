import 'package:flutter/material.dart';

import '../cleaner/cleaner_controller.dart';

/// The step while the bridge deletes, shown for every [DeletingState].
class DeletingView extends StatelessWidget {
  const DeletingView({super.key, required this.state});

  final DeletingState state;

  @override
  Widget build(BuildContext context) {
    return const SizedBox.shrink();
  }
}
