import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';
import '../design/design.dart';
import '../scan_view/scan_view.dart';
import '../section/section.dart';
import 'app_destination.dart';
import 'window_frame.dart';

const double sidebarWidth = 252;

const double _glyphSize = 28;

/// The key of the sidebar's entry for the destination [value].
final class SidebarEntryKey extends ValueKey<AppDestination> {
  const SidebarEntryKey(super.value);
}

/// The sidebar: Overview, a section for each one that holds anything, as
/// the scan finds them, then "Handled by its own app" and Settings. Its top
/// keeps the title bar's strip free.
class Sidebar extends StatelessWidget {
  const Sidebar({
    super.key,
    required this.state,
    required this.destination,
    required this.onDestinationSelected,
  });

  final CleanerState state;
  final AppDestination destination;

  /// `null` while a step of the delete flow covers the pages.
  final ValueChanged<AppDestination>? onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final List<SectionTotal> totals = listShownSectionTotals(state);
    final SectionTotal? ownAppTotal = findSectionTotal(totals, SectionKey.ownApp);
    return SizedBox(
      width: sidebarWidth,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 10, 0, 10),
        child: GlassCard(
          padding: EdgeInsets.zero,
          borderRadius: 20,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: titleBarHeight),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 14),
                child: Text('MAGIC FREE DISK SPACE', style: TypeRamp.overline),
              ),
              _buildEntry(
                destination: const OverviewDestination(),
                title: 'Overview',
                glyph: AppIcons.overview,
                accent: StageColors.overviewAccent,
                figureText: null,
              ),
              if (totals.any((SectionTotal total) => total.sectionKey != SectionKey.ownApp))
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
                  child: Text('SECTIONS', style: TypeRamp.overline),
                ),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.zero,
                  children: [
                    for (final SectionTotal total in totals)
                      if (total.sectionKey != SectionKey.ownApp)
                        _buildSectionEntry(total),
                  ],
                ),
              ),
              const Divider(
                height: 1,
                thickness: 1,
                indent: 16,
                endIndent: 16,
                color: GlassTokens.rimShade,
              ),
              const SizedBox(height: StageSpacing.small),
              _buildEntry(
                destination: const HandledElsewhereDestination(),
                title: ownAppTotal?.titleText ?? handledElsewhereTitle,
                glyph: SectionLook.ownApp.glyph,
                accent: SectionLook.ownApp.accent,
                figureText: ownAppTotal == null ? null : formatSectionFigureText(ownAppTotal),
              ),
              _buildEntry(
                destination: const SettingsDestination(),
                title: 'Settings',
                glyph: AppIcons.settings,
                accent: StageColors.textSecondary,
                figureText: null,
              ),
              const SizedBox(height: StageSpacing.small),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSectionEntry(SectionTotal total) {
    final SectionLook look = sectionKeyToLook(total.sectionKey);
    return _buildEntry(
      destination: buildSectionDestination(total.sectionKey),
      title: total.titleText,
      glyph: look.glyph,
      accent: look.accent,
      figureText: formatSectionFigureText(total),
    );
  }

  Widget _buildEntry({
    required AppDestination destination,
    required String title,
    required IconData glyph,
    required Color accent,
    required String? figureText,
  }) {
    final ValueChanged<AppDestination>? onDestinationSelected =
        this.onDestinationSelected;
    return _SidebarEntry(
      key: SidebarEntryKey(destination),
      title: title,
      glyph: glyph,
      accent: accent,
      figureText: figureText,
      isSelected: destination == this.destination,
      onPressed: onDestinationSelected == null
          ? null
          : () => onDestinationSelected(destination),
    );
  }
}

class _SidebarEntry extends StatelessWidget {
  const _SidebarEntry({
    super.key,
    required this.title,
    required this.glyph,
    required this.accent,
    required this.figureText,
    required this.isSelected,
    required this.onPressed,
  });

  final String title;
  final IconData glyph;
  final Color accent;

  /// The section's size, or the count of its places for advice alone.
  final String? figureText;
  final bool isSelected;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final String? figureText = this.figureText;
    final BorderRadius radius = BorderRadius.circular(12);
    final Duration duration = MotionScope.of(context).plainFadeDuration;
    return Semantics(
      container: true,
      button: true,
      selected: isSelected,
      enabled: onPressed != null,
      label: figureText == null ? title : '$title, $figureText',
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 1),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: onPressed,
            borderRadius: radius,
            hoverColor: accent.withValues(alpha: 0.07),
            child: ExcludeSemantics(
              child: AnimatedContainer(
                duration: duration,
                curve: Curves.easeOut,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: radius,
                  color: isSelected
                      ? accent.withValues(alpha: 0.14)
                      : Colors.transparent,
                  border: Border.all(
                    color: isSelected
                        ? accent.withValues(alpha: 0.42)
                        : Colors.transparent,
                  ),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: accent.withValues(alpha: 0.22),
                            blurRadius: 18,
                            spreadRadius: -6,
                          ),
                        ]
                      : null,
                ),
                child: LayoutBuilder(
                  builder: (BuildContext context, BoxConstraints constraints) {
                    return Row(
                      children: [
                        GlyphTile(glyph: glyph, accent: accent, size: _glyphSize),
                        const SizedBox(width: StageSpacing.medium),
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TypeRamp.label.copyWith(
                              color: isSelected
                                  ? StageColors.textPrimary
                                  : StageColors.textSecondary,
                            ),
                          ),
                        ),
                        if (figureText != null) ...[
                          const SizedBox(width: StageSpacing.small),
                          // The title gives way first; the figure takes at
                          // most the whole room beside the tile.
                          ConstrainedBox(
                            constraints: BoxConstraints(
                              maxWidth: math.max(
                                0,
                                constraints.maxWidth - _glyphSize - StageSpacing.medium - StageSpacing.small,
                              ),
                            ),
                            child: Text(
                              figureText,
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                              style: TypeRamp.caption,
                            ),
                          ),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
