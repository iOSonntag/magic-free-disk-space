import '../bridge/bridge.dart';
import '../design/design.dart';

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

/// The title of the section [key] where a scan shows: for a key this app
/// does not know, the bridge's own title of its first such section in
/// [scan], else the title of its [SectionLook].
String formatScanSectionTitle(SectionKey key, {required ScannedEvent? scan}) {
  if (key != SectionKey.unknown || scan == null) {
    return sectionKeyToLook(key).title;
  }
  for (final SectionView section in scan.sections) {
    if (section.key == SectionKey.unknown) {
      return section.titleText;
    }
  }
  return sectionKeyToLook(key).title;
}
