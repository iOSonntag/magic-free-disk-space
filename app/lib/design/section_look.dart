import 'package:flutter/widgets.dart';

import 'app_icons.dart';

/// The look of each section the bridge names: its one glowing accent and its
/// glyph; the bridge gives its title. [unknown] is the neutral look of a
/// section key this app does not know yet.
enum SectionLook {
  caches(accent: Color(0xFF38E1FF), glyph: AppIcons.caches),
  developerTools(accent: Color(0xFF9B7BFF), glyph: AppIcons.developerTools),
  projects(accent: Color(0xFF5B8CFF), glyph: AppIcons.projects),
  containers(accent: Color(0xFF34E0A1), glyph: AppIcons.containers),
  aiModels(accent: Color(0xFFFF5CE1), glyph: AppIcons.aiModels),
  downloads(accent: Color(0xFFFFB547), glyph: AppIcons.downloads),
  icloud(accent: Color(0xFF7CC8FF), glyph: AppIcons.icloud),
  apps(accent: Color(0xFFFF7A59), glyph: AppIcons.apps),
  largeFiles(accent: Color(0xFFB7F05A), glyph: AppIcons.largeFiles),
  trash(accent: Color(0xFFFF5470), glyph: AppIcons.trash),
  ownApp(accent: Color(0xFFC9B8FF), glyph: AppIcons.ownApp),
  unknown(accent: Color(0xFF8A93A8), glyph: AppIcons.unknownSection);

  const SectionLook({required this.accent, required this.glyph});

  final Color accent;
  final IconData glyph;
}
