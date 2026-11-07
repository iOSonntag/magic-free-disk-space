import 'package:flutter/widgets.dart';

import 'app_icons.dart';

/// The look of each section the bridge names: its title, its one glowing
/// accent and its glyph. [unknown] is the neutral look of a section key this
/// app does not know yet.
enum SectionLook {
  caches(title: 'Caches', accent: Color(0xFF38E1FF), glyph: AppIcons.caches),
  developerTools(title: 'Developer tools', accent: Color(0xFF9B7BFF), glyph: AppIcons.developerTools),
  projects(title: 'Projects', accent: Color(0xFF5B8CFF), glyph: AppIcons.projects),
  containers(title: 'Containers and VMs', accent: Color(0xFF34E0A1), glyph: AppIcons.containers),
  aiModels(title: 'AI models', accent: Color(0xFFFF5CE1), glyph: AppIcons.aiModels),
  downloads(title: 'Downloads and installers', accent: Color(0xFFFFB547), glyph: AppIcons.downloads),
  icloud(title: 'iCloud Drive', accent: Color(0xFF7CC8FF), glyph: AppIcons.icloud),
  apps(title: 'Apps', accent: Color(0xFFFF7A59), glyph: AppIcons.apps),
  largeFiles(title: 'Large files', accent: Color(0xFFB7F05A), glyph: AppIcons.largeFiles),
  trash(title: 'Trash', accent: Color(0xFFFF5470), glyph: AppIcons.trash),
  ownApp(title: 'Handled by its own app', accent: Color(0xFFC9B8FF), glyph: AppIcons.ownApp),
  unknown(title: 'Other items', accent: Color(0xFF8A93A8), glyph: AppIcons.unknownSection);

  const SectionLook({required this.title, required this.accent, required this.glyph});

  /// The app's own title of the section; a section of a newer bridge shows
  /// the bridge's title instead where a scan names it.
  final String title;
  final Color accent;
  final IconData glyph;
}
