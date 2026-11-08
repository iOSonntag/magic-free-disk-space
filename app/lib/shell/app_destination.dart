import '../bridge/bridge.dart';

/// A page the sidebar leads to. The steps of the delete flow, Review and
/// Result, are no destination: the shell shows them by the cleaner's state.
sealed class AppDestination {
  const AppDestination();
}

/// The destination that shows the items of [sectionKey]: their own page, or
/// "Handled by its own app" for [SectionKey.ownApp].
AppDestination buildSectionDestination(SectionKey sectionKey) {
  return switch (sectionKey) {
    SectionKey.ownApp => const HandledElsewhereDestination(),
    SectionKey.caches ||
    SectionKey.developerTools ||
    SectionKey.projects ||
    SectionKey.containers ||
    SectionKey.aiModels ||
    SectionKey.downloads ||
    SectionKey.icloud ||
    SectionKey.apps ||
    SectionKey.largeFiles ||
    SectionKey.trash ||
    SectionKey.unknown => SectionDestination._(sectionKey),
  };
}

final class OverviewDestination extends AppDestination {
  const OverviewDestination();

  @override
  bool operator ==(Object other) {
    return other is OverviewDestination;
  }

  @override
  int get hashCode {
    return (OverviewDestination).hashCode;
  }
}

/// The page of one section; never [SectionKey.ownApp], whose items
/// [HandledElsewhereDestination] shows, so [buildSectionDestination] alone
/// makes one.
final class SectionDestination extends AppDestination {
  const SectionDestination._(this.sectionKey);

  final SectionKey sectionKey;

  @override
  bool operator ==(Object other) {
    return other is SectionDestination && other.sectionKey == sectionKey;
  }

  @override
  int get hashCode {
    return Object.hash(SectionDestination, sectionKey);
  }
}

/// The page of the items only their own app can remove.
final class HandledElsewhereDestination extends AppDestination {
  const HandledElsewhereDestination();

  @override
  bool operator ==(Object other) {
    return other is HandledElsewhereDestination;
  }

  @override
  int get hashCode {
    return (HandledElsewhereDestination).hashCode;
  }
}

final class SettingsDestination extends AppDestination {
  const SettingsDestination();

  @override
  bool operator ==(Object other) {
    return other is SettingsDestination;
  }

  @override
  int get hashCode {
    return (SettingsDestination).hashCode;
  }
}
