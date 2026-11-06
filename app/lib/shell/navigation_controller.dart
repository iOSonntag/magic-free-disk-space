import 'package:flutter/foundation.dart';

import '../bridge/bridge_event.dart';
import 'app_destination.dart';

/// The destination the sidebar shows; the Overview at launch.
class NavigationController extends ChangeNotifier {
  AppDestination _destination = const OverviewDestination();

  AppDestination get destination => _destination;

  void showDestination(AppDestination destination) {
    if (destination == _destination) {
      return;
    }
    _destination = destination;
    notifyListeners();
  }
}

/// The destination that shows the items of [sectionKey]: their own page, or
/// "Handled by its own app" for [SectionKey.ownApp].
AppDestination buildSectionDestination(SectionKey sectionKey) {
  return switch (sectionKey) {
    SectionKey.ownApp => const HandledElsewhereDestination(),
    _ => SectionDestination(sectionKey),
  };
}
