import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';

/// The sizes the CLI's formatBytes test reads too, each with the text Finder
/// shows for it, so the app and the CLI show one size alike; read from the
/// `app` folder, where `flutter test` runs.
List<({int bytes, String text})> loadSharedSizeCases() {
  final Object? json = jsonDecode(
    File('../test/report/formatBytesCases.json').readAsStringSync(),
  );
  if (json is! List<Object?>) {
    throw const FormatException('formatBytesCases.json must hold a list of cases.');
  }
  return [
    for (final Object? item in json)
      switch (item) {
        {'bytes': final int bytes, 'text': final String text} => (
          bytes: bytes,
          text: text,
        ),
        _ => throw FormatException(
          'A case of formatBytesCases.json is not { bytes, text }: $item',
        ),
      },
  ];
}

void main() {
  group('formatBytes', () {
    final List<({int bytes, String text})> sizeCases = loadSharedSizeCases();

    test('reads the cases it shares with the CLI', () {
      expect(sizeCases, isNotEmpty);
    });

    for (final ({int bytes, String text}) sizeCase in sizeCases) {
      test('shows ${sizeCase.bytes} bytes as ${sizeCase.text}', () {
        expect(formatBytes(sizeCase.bytes), sizeCase.text);
      });
    }

    test('throws for a negative count', () {
      expect(() => formatBytes(-1), throwsArgumentError);
    });
  });

  group('formatSizeText', () {
    test('shows a complete size as formatBytes does', () {
      expect(formatSizeText(allocatedBytes: 1500, isComplete: true), '1.5 KB');
    });

    test('prefixes an incomplete size with at least', () {
      expect(formatSizeText(allocatedBytes: 1500, isComplete: false), 'at least 1.5 KB');
    });

    test('gives zero bytes for nothing', () {
      expect(formatSizeText(allocatedBytes: 0, isComplete: true), '0 B');
    });
  });
}
