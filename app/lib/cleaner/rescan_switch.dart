/// The switch "Scan again after deleting" as the settings show it.
sealed class RescanSwitch {
  const RescanSwitch();
}

/// The status at start has not answered yet, so the stored value is not known.
final class RescanSwitchLoading extends RescanSwitch {
  const RescanSwitchLoading();
}

/// The bridge answered the stored value.
final class RescanSwitchConfirmed extends RescanSwitch {
  const RescanSwitchConfirmed({required this.isEnabled});

  final bool isEnabled;
}

final class RescanSwitchSaving extends RescanSwitch {
  const RescanSwitchSaving({required this.isEnabled});

  /// The value the save asks for; the confirmed one is its opposite.
  final bool isEnabled;
}

/// The status at start threw or failed, so the stored value stays unknown.
final class RescanSwitchUnavailable extends RescanSwitch {
  const RescanSwitchUnavailable();
}
