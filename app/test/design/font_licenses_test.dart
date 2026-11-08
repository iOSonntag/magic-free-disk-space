import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/font_licenses.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(LicenseRegistry.reset);

  test('registers the bundled fonts with their licence texts', () async {
    registerBundledFontLicenses();

    final List<LicenseEntry> entries = await LicenseRegistry.licenses.toList();
    final Map<String, String> textsByPackage = <String, String>{
      for (final LicenseEntry entry in entries)
        entry.packages.single: entry.paragraphs.map((LicenseParagraph paragraph) => paragraph.text).join('\n'),
    };

    expect(textsByPackage.keys, unorderedEquals(<String>['Inter', 'Material Symbols Rounded']));
    expect(textsByPackage['Inter'], contains('SIL Open Font License, Version 1.1'));
    expect(textsByPackage['Material Symbols Rounded'], contains('Apache License'));
  });
}
