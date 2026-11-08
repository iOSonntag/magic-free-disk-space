import 'package:flutter/foundation.dart';

/// What the disk ring shows.
sealed class DiskRingReading {
  const DiskRingReading();
}

/// The whole volume: its capacity, what is available, and the share of the
/// used space a delete can free.
final class DiskRingVolumeReading extends DiskRingReading {
  const DiskRingVolumeReading({
    required this.capacityBytes,
    required this.availableBytes,
    required this.freeableBytes,
  });

  final int capacityBytes;
  final int availableBytes;
  final int freeableBytes;
}

/// Only what can be freed, for when the volume's space could not be read.
final class DiskRingFreeableReading extends DiskRingReading {
  const DiskRingFreeableReading({required this.freeableBytes});

  final int freeableBytes;
}

/// The ring's arcs as fractions of a turn, clockwise from the top: the used
/// space that stays ends at [keptEnd], what can be freed runs from there to
/// [freeableEnd], and the available space fills the rest.
@immutable
class DiskRingArcs {
  const DiskRingArcs({required this.keptEnd, required this.freeableEnd});

  static const DiskRingArcs empty = DiskRingArcs(keptEnd: 0, freeableEnd: 0);

  final double keptEnd;
  final double freeableEnd;

  static DiskRingArcs lerp(DiskRingArcs from, DiskRingArcs to, double t) {
    return DiskRingArcs(
      keptEnd: from.keptEnd * (1 - t) + to.keptEnd * t,
      freeableEnd: from.freeableEnd * (1 - t) + to.freeableEnd * t,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is DiskRingArcs && other.keptEnd == keptEnd && other.freeableEnd == freeableEnd;

  @override
  int get hashCode => Object.hash(keptEnd, freeableEnd);

  @override
  String toString() => 'DiskRingArcs(keptEnd: $keptEnd, freeableEnd: $freeableEnd)';
}

/// The arcs of [reading], its bytes clamped where they contradict each
/// other; a freeable-only reading lights the whole ring once anything can be
/// freed.
DiskRingArcs buildDiskRingArcs(DiskRingReading reading) {
  switch (reading) {
    case DiskRingVolumeReading():
      if (reading.capacityBytes <= 0) {
        return DiskRingArcs.empty;
      }

      // The volume and the scan are read apart, so what can be freed may
      // exceed the used space, and the available space the capacity.
      final int availableBytes = reading.availableBytes.clamp(0, reading.capacityBytes);
      final int usedBytes = reading.capacityBytes - availableBytes;
      final int freeableBytes = reading.freeableBytes.clamp(0, usedBytes);
      return DiskRingArcs(
        keptEnd: (usedBytes - freeableBytes) / reading.capacityBytes,
        freeableEnd: usedBytes / reading.capacityBytes,
      );
    case DiskRingFreeableReading():
      return DiskRingArcs(keptEnd: 0, freeableEnd: reading.freeableBytes > 0 ? 1 : 0);
  }
}
