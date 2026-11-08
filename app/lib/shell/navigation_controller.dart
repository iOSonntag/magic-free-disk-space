import 'package:flutter/foundation.dart';

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
