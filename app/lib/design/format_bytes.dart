typedef _DecimalUnitScale = ({String unit, int bytesPerUnit});

// Decimal units, as macOS counts disk space; the CLI's `formatBytes` writes
// the same, so a size reads alike in both.
const List<_DecimalUnitScale> _decimalUnitScales = <_DecimalUnitScale>[
  // Finder writes the thousand bytes as KB.
  (unit: 'KB', bytesPerUnit: 1000),
  (unit: 'MB', bytesPerUnit: 1000 * 1000),
  (unit: 'GB', bytesPerUnit: 1000 * 1000 * 1000),
];
const _DecimalUnitScale _largestDecimalUnitScale = (unit: 'TB', bytesPerUnit: 1000 * 1000 * 1000 * 1000);

/// Formats a byte count in decimal units, 1 GB being 10⁹ bytes, with one
/// decimal below ten of a unit. Throws an [ArgumentError] for a negative
/// count.
String formatBytes(int bytes) {
  // A negative count is a broken invariant of the caller.
  if (bytes < 0) {
    throw ArgumentError.value(bytes, 'bytes', 'must not be negative');
  }

  if (bytes < 1000) {
    return '$bytes B';
  }

  final ({double value, String unit}) scaled = _scaleToDecimalUnit(bytes);
  final String valueText = scaled.value < 10 ? scaled.value.toStringAsFixed(1) : '${scaled.value.round()}';
  return '$valueText ${scaled.unit}';
}

/// A size as the app shows it: prefixed with "at least" when the
/// measurement is a lower bound.
String formatSizeText({required int allocatedBytes, required bool isComplete}) {
  final String bytesText = formatBytes(allocatedBytes);
  if (isComplete) {
    return bytesText;
  }

  return 'at least $bytesText';
}

({double value, String unit}) _scaleToDecimalUnit(int bytes) {
  for (final _DecimalUnitScale scale in _decimalUnitScales) {
    final double value = bytes / scale.bytesPerUnit;
    // Compared after rounding, so 999.6 KB shows as 1.0 MB rather than 1000 KB.
    if (value.round() < 1000) {
      return (value: value, unit: scale.unit);
    }
  }

  return (value: bytes / _largestDecimalUnitScale.bytesPerUnit, unit: _largestDecimalUnitScale.unit);
}
