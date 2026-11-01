import 'package:flutter/material.dart';

/// A message that something went wrong, selectable, in the error colour of
/// the theme.
class ErrorText extends StatelessWidget {
  const ErrorText({super.key, required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return SelectableText(
      text,
      style: TextStyle(color: Theme.of(context).colorScheme.error),
    );
  }
}
