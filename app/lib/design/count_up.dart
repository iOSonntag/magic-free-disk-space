import 'dart:ui';

import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'tokens.dart';

/// A number that counts from the one it showed to [value], up or down. It
/// jumps while motion is reduced. Assistive technology reads only the
/// formatted [value], never a figure on the way.
class CountUp extends StatefulWidget {
  const CountUp({super.key, required this.value, required this.format, this.style});

  final int value;
  final String Function(int value) format;
  final TextStyle? style;

  @override
  State<CountUp> createState() => _CountUpState();
}

class _CountUpState extends State<CountUp> with SingleTickerProviderStateMixin {
  late final AnimationController _progress = AnimationController(vsync: this, duration: MotionTokens.countUp);
  late final CurvedAnimation _eased = CurvedAnimation(parent: _progress, curve: MotionTokens.countUpCurve);
  late int _fromValue = widget.value;

  @override
  void initState() {
    super.initState();
    _progress.value = 1;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MotionScope.of(context).isReduced && _progress.isAnimating) {
      _progress.value = 1;
    }
  }

  @override
  void didUpdateWidget(CountUp oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value == widget.value) {
      return;
    }

    _fromValue = _shownValue(oldWidget.value);
    if (MotionScope.of(context).isReduced) {
      _progress.value = 1;
      return;
    }

    _progress.forward(from: 0);
  }

  @override
  void dispose() {
    _eased.dispose();
    _progress.dispose();
    super.dispose();
  }

  int _shownValue(int targetValue) {
    return lerpDouble(_fromValue, targetValue, _eased.value)!.round();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: widget.format(widget.value),
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _eased,
        builder: (BuildContext context, Widget? child) {
          return Text(widget.format(_shownValue(widget.value)), style: widget.style);
        },
      ),
    );
  }
}
