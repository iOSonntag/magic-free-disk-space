import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/format_bytes.dart';

// The cases of test/report/formatBytes.test.ts, so the app and the CLI show one size alike.
void main() {
  group('formatBytes', () {
    test('shows counts under one kB in bytes', () {
      expect(formatBytes(0), '0 B');
      expect(formatBytes(999), '999 B');
    });

    test('shows one decimal below ten of a unit and a whole number from ten up', () {
      expect(formatBytes(1000), '1.0 kB');
      expect(formatBytes(1500), '1.5 kB');
      expect(formatBytes(9500), '9.5 kB');
      expect(formatBytes(10000), '10 kB');
      expect(formatBytes(10000000), '10 MB');
    });

    test('counts binary sizes in decimal units', () {
      expect(formatBytes(1024), '1.0 kB');
      expect(formatBytes(1024 * 1024), '1.0 MB');
      expect(formatBytes(1024 * 1024 * 1024), '1.1 GB');
    });

    test('moves up a unit at each step of 1000, after rounding', () {
      expect(formatBytes(999600), '1.0 MB');
      expect(formatBytes(1000000000), '1.0 GB');
      expect(formatBytes(2254857830), '2.3 GB');
      expect(formatBytes(2 * 1000 * 1000 * 1000 * 1000), '2.0 TB');
    });

    test('keeps TB as the largest unit', () {
      expect(formatBytes(1000 * 1000 * 1000 * 1000 * 1000), '1000 TB');
    });

    test('throws for a negative count', () {
      expect(() => formatBytes(-1), throwsArgumentError);
    });
  });

  group('formatSizeText', () {
    test('shows a complete size as formatBytes does', () {
      expect(formatSizeText(allocatedBytes: 1500, isComplete: true), '1.5 kB');
    });

    test('prefixes an incomplete size with at least', () {
      expect(formatSizeText(allocatedBytes: 1500, isComplete: false), 'at least 1.5 kB');
    });

    test('gives zero bytes for nothing', () {
      expect(formatSizeText(allocatedBytes: 0, isComplete: true), '0 B');
    });
  });
}
