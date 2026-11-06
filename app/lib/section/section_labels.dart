import '../bridge/bridge_event.dart';
import '../design/section_look.dart';

/// The app's title of the section [key]; an unknown key reads as
/// "Other items".
String formatSectionTitle(SectionKey key) {
  return switch (key) {
    SectionKey.caches => 'Caches',
    SectionKey.developerTools => 'Developer tools',
    SectionKey.projects => 'Projects',
    SectionKey.containers => 'Containers and VMs',
    SectionKey.aiModels => 'AI models',
    SectionKey.downloads => 'Downloads and installers',
    SectionKey.icloud => 'iCloud Drive',
    SectionKey.apps => 'Apps',
    SectionKey.largeFiles => 'Large files',
    SectionKey.trash => 'Trash',
    SectionKey.ownApp => 'Handled by its own app',
    SectionKey.unknown => 'Other items',
  };
}

/// The title of the section [key] where a scan shows: for a key this app
/// does not know, the bridge's own title of its first such section in
/// [scan], else [formatSectionTitle]'s.
String formatScanSectionTitle(SectionKey key, {required ScannedEvent? scan}) {
  if (key != SectionKey.unknown || scan == null) {
    return formatSectionTitle(key);
  }
  for (final SectionView section in scan.sections) {
    if (section.key == SectionKey.unknown) {
      return section.titleText;
    }
  }
  return formatSectionTitle(key);
}

SectionLook sectionKeyToLook(SectionKey key) {
  return switch (key) {
    SectionKey.caches => SectionLook.caches,
    SectionKey.developerTools => SectionLook.developerTools,
    SectionKey.projects => SectionLook.projects,
    SectionKey.containers => SectionLook.containers,
    SectionKey.aiModels => SectionLook.aiModels,
    SectionKey.downloads => SectionLook.downloads,
    SectionKey.icloud => SectionLook.icloud,
    SectionKey.apps => SectionLook.apps,
    SectionKey.largeFiles => SectionLook.largeFiles,
    SectionKey.trash => SectionLook.trash,
    SectionKey.ownApp => SectionLook.ownApp,
    SectionKey.unknown => SectionLook.unknown,
  };
}
