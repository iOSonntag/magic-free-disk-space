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
