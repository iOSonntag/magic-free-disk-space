import 'package:flutter/widgets.dart';

/// Every glyph of the app, from the bundled Material Symbols Rounded font.
/// Each one stays a const [IconData], so the release build's icon tree
/// shaker keeps only these code points of the 15 MB variable font.
abstract final class AppIcons {
  static const String fontFamily = 'MaterialSymbolsRounded';

  static const IconData caches = IconData(0xea0b, fontFamily: fontFamily);
  static const IconData developerTools = IconData(0xeb8e, fontFamily: fontFamily);
  static const IconData projects = IconData(0xf3c8, fontFamily: fontFamily);
  static const IconData containers = IconData(0xf720, fontFamily: fontFamily);
  static const IconData aiModels = IconData(0xe10e, fontFamily: fontFamily);
  static const IconData downloads = IconData(0xf090, fontFamily: fontFamily);
  static const IconData icloud = IconData(0xf15c, fontFamily: fontFamily);
  static const IconData apps = IconData(0xe5c3, fontFamily: fontFamily);
  static const IconData largeFiles = IconData(0xe66d, fontFamily: fontFamily);
  static const IconData trash = IconData(0xe92e, fontFamily: fontFamily);
  static const IconData ownApp = IconData(0xe89e, fontFamily: fontFamily);
  static const IconData unknownSection = IconData(0xe72c, fontFamily: fontFamily);

  static const IconData overview = IconData(0xe917, fontFamily: fontFamily);
  static const IconData settings = IconData(0xe8b8, fontFamily: fontFamily);
  static const IconData scanAgain = IconData(0xe5d5, fontFamily: fontFamily);
  static const IconData disk = IconData(0xf80e, fontFamily: fontFamily);
  static const IconData freeable = IconData(0xe65f, fontFamily: fontFamily);
  static const IconData cleanSafeItems = IconData(0xf0ff, fontFamily: fontFamily);

  static const IconData info = IconData(0xe88e, fontFamily: fontFamily);
  static const IconData revealInFinder = IconData(0xe2c8, fontFamily: fontFamily);
  static const IconData lastUsed = IconData(0xefd6, fontFamily: fontFamily);
  static const IconData nameMatch = IconData(0xf014, fontFamily: fontFamily);
  static const IconData expand = IconData(0xe5cf, fontFamily: fontFamily);
  static const IconData collapse = IconData(0xe5ce, fontFamily: fontFamily);
  static const IconData forward = IconData(0xe5cc, fontFamily: fontFamily);
  static const IconData back = IconData(0xe5c4, fontFamily: fontFamily);
  static const IconData close = IconData(0xe5cd, fontFamily: fontFamily);
  static const IconData check = IconData(0xe668, fontFamily: fontFamily);

  static const IconData safeGroup = IconData(0xef76, fontFamily: fontFamily);
  static const IconData reviewGroup = IconData(0xe8f4, fontFamily: fontFamily);
  static const IconData carefulGroup = IconData(0xf083, fontFamily: fontFamily);

  static const IconData deleteForever = IconData(0xe92b, fontFamily: fontFamily);
  static const IconData removed = IconData(0xf0be, fontFamily: fontFamily);
  static const IconData partlyRemoved = IconData(0xe422, fontFamily: fontFamily);
  static const IconData kept = IconData(0xe925, fontFamily: fontFamily);
  static const IconData failed = IconData(0xf8b6, fontFamily: fontFamily);
  static const IconData returnsLater = IconData(0xf5f3, fontFamily: fontFamily);
  static const IconData showLog = IconData(0xe873, fontFamily: fontFamily);

  static const IconData fullDiskAccess = IconData(0xe9e0, fontFamily: fontFamily);
  static const IconData update = IconData(0xf2cd, fontFamily: fontFamily);

  static const IconData photos = IconData(0xe413, fontFamily: fontFamily);
  static const IconData messages = IconData(0xe0c9, fontFamily: fontFamily);
  static const IconData music = IconData(0xe405, fontFamily: fontFamily);
  static const IconData tv = IconData(0xe63b, fontFamily: fontFamily);
  static const IconData podcasts = IconData(0xf048, fontFamily: fontFamily);
  static const IconData garageBand = IconData(0xe521, fontFamily: fontFamily);
  static const IconData logicPro = IconData(0xe1b8, fontFamily: fontFamily);
  static const IconData iMovie = IconData(0xe404, fontFamily: fontFamily);
  static const IconData finalCutPro = IconData(0xf840, fontFamily: fontFamily);
  static const IconData finder = IconData(0xe2c7, fontFamily: fontFamily);

  static const IconData storageSettings = IconData(0xe1db, fontFamily: fontFamily);
  static const IconData icloudSettings = icloud;
  static const IconData timeMachineSettings = IconData(0xe8ba, fontFamily: fontFamily);
}
