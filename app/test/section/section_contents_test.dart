import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/scan_view/scan_view.dart';
import 'package:magic_free_disk_space/section/advice_card.dart';
import 'package:magic_free_disk_space/section/item_group_card.dart';

import '../support/sample_events.dart';
import '../support/test_items.dart';

void main() {
  final ScannedEvent sampleScan = loadSampleEvent<ScannedEvent>();

  group('buildSectionContents', () {
    test('sorts the items of a section into their groups', () {
      final SectionContents caches = buildSectionContents(
        sampleScan,
        SectionKey.caches,
      );

      expect(getItemNumbers(caches.getGroupItems(ShownItemGroup.safe)), [1]);
      expect(getItemNumbers(caches.getGroupItems(ShownItemGroup.review)), [2]);
      expect(caches.getGroupItems(ShownItemGroup.careful), isEmpty);
      expect(caches.adviceItems, isEmpty);
    });

    test('takes the Explore items and the advice of their section', () {
      final SectionContents developerTools = buildSectionContents(
        sampleScan,
        SectionKey.developerTools,
      );

      final List<int> exploreNumbers = [
        for (final ItemView item in sampleScan.explore!.items)
          if (item.sectionKey == SectionKey.developerTools) item.number,
      ];
      expect(exploreNumbers, isNotEmpty);
      expect(
        getItemNumbers(developerTools.getGroupItems(ShownItemGroup.review)),
        exploreNumbers,
      );
      expect(
        [for (final AdviceItemView item in developerTools.adviceItems) item.title],
        ['Tool store'],
      );
      expect(developerTools.isEmpty, isFalse);
    });

    test('is empty for a section the scan holds nothing of', () {
      expect(buildSectionContents(sampleScan, SectionKey.trash).isEmpty, isTrue);
    });

    test('shows an item of a group this app does not know for review', () {
      expect(itemGroupToShownItemGroup(ItemGroup.unknown), ShownItemGroup.review);
    });

    test('offers every item for removal but one the bridge never plans', () {
      expect(
        [for (final ItemView item in sampleScan.selectableItems) if (!isItemRemovable(item)) item.title],
        ['Xcode'],
      );
    });
  });

  test('listSelectedItems and sumItemSizes add up the selection, and its text says when it is a lower bound', () {
    final List<ItemView> selected = listSelectedItems(sampleScan, {1, 2});

    expect(getItemNumbers(selected), [1, 2]);
    final ItemSizeSum selectedSize = sumItemSizes(selected);
    expect(selectedSize.allocatedBytes, 10000000);
    expect(selectedSize.isComplete, isFalse);
    expect(formatItemSizeSumText(selectedSize), 'at least 10 MB');
    final ItemSizeSum emptySize = sumItemSizes(const []);
    expect(emptySize.allocatedBytes, 0);
    expect(emptySize.isComplete, isTrue);
    expect(formatItemSizeSumText(emptySize), '0 B');
  });

  group('section totals', () {
    test('merge the totals of keys this app does not know where the first of them stood', () {
      const SectionTotal futureThings = SectionTotal(
        sectionKey: SectionKey.unknown,
        titleText: 'Future things',
        allocatedBytes: 3000000,
        isComplete: true,
        removableBytes: 1000000,
        isRemovableComplete: true,
        itemCount: 1,
        safeBytes: 0,
        adviceCount: 0,
      );
      const SectionTotal otherFuture = SectionTotal(
        sectionKey: SectionKey.unknown,
        titleText: 'Other future',
        allocatedBytes: 2000000,
        isComplete: false,
        removableBytes: 2000000,
        isRemovableComplete: false,
        itemCount: 2,
        safeBytes: 1000000,
        adviceCount: 1,
      );
      const SectionTotal caches = SectionTotal(
        sectionKey: SectionKey.caches,
        titleText: 'Caches',
        allocatedBytes: 1000000,
        isComplete: true,
        removableBytes: 1000000,
        isRemovableComplete: true,
        itemCount: 1,
        safeBytes: 1000000,
        adviceCount: 0,
      );

      final List<SectionTotal> merged = mergeSectionTotalsByKey([
        futureThings,
        caches,
        otherFuture,
      ]);

      expect([for (final SectionTotal total in merged) total.sectionKey], [
        SectionKey.unknown,
        SectionKey.caches,
      ]);
      final SectionTotal unknown = merged.first;
      expect(unknown.titleText, 'Future things and Other future');
      expect(unknown.allocatedBytes, 5000000);
      expect(unknown.isComplete, isFalse);
      expect(unknown.removableBytes, 3000000);
      expect(unknown.isRemovableComplete, isFalse);
      expect(unknown.itemCount, 3);
      expect(unknown.safeBytes, 1000000);
      expect(unknown.adviceCount, 1);
      expect(merged.last, same(caches));
    });

    test('say how many items a section holds', () {
      final List<SectionTotal> totals = sampleScan.sectionTotals;

      expect(
        formatSectionCountText(findSectionTotal(totals, SectionKey.caches)!),
        '2 items',
      );
      expect(
        formatSectionCountText(findSectionTotal(totals, SectionKey.developerTools)!),
        '2 items · 1 to handle yourself',
      );
      expect(
        formatSectionCountText(findSectionTotal(totals, SectionKey.icloud)!),
        '1 item',
      );
      expect(findSectionTotal(totals, SectionKey.trash), isNull);
    });

    test('keep the order the bridge sends them in, not the order of the keys', () {
      final List<SectionTotal> totals = loadScanWithReversedTotals().sectionTotals;

      expect([for (final SectionTotal total in mergeSectionTotalsByKey(totals)) total.sectionKey], [
        SectionKey.icloud,
        SectionKey.largeFiles,
        SectionKey.apps,
        SectionKey.developerTools,
        SectionKey.caches,
      ]);
    });

    test('show the size of a section, or the count of places of one of advice alone', () {
      const SectionTotal adviceOnly = SectionTotal(
        sectionKey: SectionKey.ownApp,
        titleText: 'Handled by its own app',
        allocatedBytes: 0,
        isComplete: true,
        removableBytes: 0,
        isRemovableComplete: true,
        itemCount: 0,
        safeBytes: 0,
        adviceCount: 2,
      );
      final List<SectionTotal> totals = sampleScan.sectionTotals;

      expect(formatSectionFigureText(findSectionTotal(totals, SectionKey.caches)!), 'at least 10 MB');
      expect(formatSectionFigureText(findSectionTotal(totals, SectionKey.apps)!), '5.0 MB');
      expect(formatSectionFigureText(adviceOnly), '2 places');
      expect(formatPlaceCount(1), '1 place');
    });
  });

  group('section titles', () {
    test('take the title the bridge gives, a key this app does not know included', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      final Map<String, Object?> largeFiles = getSectionTotalJson(json, 'largeFiles');
      largeFiles['sectionKey'] = 'futureThings';
      largeFiles['titleText'] = 'Future things';
      final List<SectionTotal> totals = parseScanJson(json).sectionTotals;

      expect(findSectionTotal(totals, SectionKey.unknown)!.titleText, 'Future things');
      expect(findSectionTotal(totals, SectionKey.icloud)!.titleText, 'iCloud Drive');
    });
  });

  group('item words', () {
    final DateTime now = DateTime.utc(2025, 9, 1);

    test('count the age of a last use in plain words', () {
      expect(formatLastUsedText(DateTime.utc(2025, 9, 1), now: now), 'Last used today');
      expect(formatLastUsedText(DateTime.utc(2025, 8, 31), now: now), 'Last used yesterday');
      expect(formatLastUsedText(DateTime.utc(2025, 8, 22), now: now), 'Last used 10 days ago');
      expect(formatLastUsedText(DateTime.utc(2025, 6, 1), now: now), 'Last used 3 months ago');
      expect(formatLastUsedText(DateTime.utc(2024, 6, 1), now: now), 'Last used a year ago');
      expect(
        formatDownloadedText(DateTime.utc(2024, 12, 24), now: now),
        'Downloaded 8 months ago',
      );
    });

    test('join the facts of an item under its title', () {
      final ItemView xcode = getSampleItem(3);
      final ItemView oldVideo = getSampleItem(6);

      expect(formatItemFactsText(xcode, now: now), 'Xcode · Last used 5 months ago');
      expect(formatItemFactsText(oldVideo, now: now), 'Last used 3 months ago');
    });

    test('show the download date of an item that was never used, as of an AI model', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      getScanItemJson(json, 6)['lastUsedAt'] = null;
      final ItemView neverUsedVideo = parseScanJson(json).selectableItems.singleWhere(
        (ItemView item) => item.number == 6,
      );

      expect(formatItemFactsText(neverUsedVideo, now: now), 'Downloaded 8 months ago');
    });

    test('mark a leftover matched by its name, and none matched by its bundle id', () {
      final ItemView byName = getSampleItem(4);
      final ItemView byBundleId = getSampleItem(5);

      expect(formatItemFactsText(byName, now: now), endsWith(' · Matched by name'));
      expect(formatItemFactsText(byBundleId, now: now), isNot(contains('Matched by name')));
    });

    test('join the facts of an advice item, its leftover match included', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      listScanAdviceJsons(json).first
        ..['lastUsedAt'] = DateTime.utc(2025, 8, 31).millisecondsSinceEpoch
        ..['appName'] = 'Photos'
        ..['matchedBy'] = 'name';
      final AdviceItemView photos = parseScanJson(json).explore!.adviceGroup!.items.first;
      final AdviceItemView toolStore = sampleScan.explore!.adviceGroup!.items.last;

      expect(formatAdviceFactsText(photos, now: now), 'Photos · Last used yesterday · Matched by name');
      expect(formatAdviceFactsText(toolStore, now: now), '');
    });
  });

  group('the group toggle', () {
    test('shows all, none, or some of its items ticked', () {
      expect(getGroupSelectValue([1, 2], {1, 2}), isTrue);
      expect(getGroupSelectValue([1, 2], {}), isFalse);
      expect(getGroupSelectValue([1, 2], {2, 7}), isNull);
    });
  });

  group('advice openers', () {
    test('open the app of the fixed list by its bundle id', () {
      final AdviceOpenerTarget target = findAdviceOpenerTarget(
        const AppOpener(app: OpenableApp.photos),
      )!;

      expect(target.name, 'Photos');
      expect(target.url, isA<OpenAppUrl>());
      expect(target.url.text, 'com.apple.Photos');
    });

    test('open the pane of System Settings of the fixed list', () {
      final AdviceOpenerTarget target = findAdviceOpenerTarget(
        const SettingsOpener(pane: SettingsPane.storage),
      )!;

      expect(target.name, 'Storage settings');
      expect(target.url, isA<SettingsPaneUrl>());
    });

    test('open nothing of a newer bridge', () {
      expect(
        findAdviceOpenerTarget(const AppOpener(app: OpenableApp.unknown)),
        isNull,
      );
      expect(
        findAdviceOpenerTarget(const SettingsOpener(pane: SettingsPane.unknown)),
        isNull,
      );
    });
  });

  test('a path reveals in Finder only when the current scan holds it', () {
    final Set<String> revealPaths = sampleScan.revealPaths;

    expect(
      RevealUrl.tryParse('/Users/me/Library/ToolStore', allowedPaths: revealPaths)?.text,
      '/Users/me/Library/ToolStore',
    );
    expect(RevealUrl.tryParse('/Users/me/Documents', allowedPaths: revealPaths), isNull);
    expect(RevealUrl.tryParse('-a', allowedPaths: {'-a'}), isNull);
    expect(RevealUrl.tryParse(null, allowedPaths: revealPaths), isNull);
  });
}
