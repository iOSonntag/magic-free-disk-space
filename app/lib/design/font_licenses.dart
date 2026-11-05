import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const String _interLicenseAssetKey = 'assets/fonts/OFL.txt';
const String _materialSymbolsLicenseAssetKey = 'assets/fonts/Apache-2.0.txt';

/// Adds the licences of the two bundled fonts to the app's licence page:
/// Inter under the SIL Open Font License 1.1, Material Symbols Rounded
/// under the Apache License 2.0. The texts load only when the page asks.
void registerBundledFontLicenses() {
  LicenseRegistry.addLicense(() async* {
    yield LicenseEntryWithLineBreaks(<String>['Inter'], await rootBundle.loadString(_interLicenseAssetKey));
    yield LicenseEntryWithLineBreaks(
      <String>['Material Symbols Rounded'],
      await rootBundle.loadString(_materialSymbolsLicenseAssetKey),
    );
  });
}
