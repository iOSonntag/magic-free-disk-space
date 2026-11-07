import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/scan_view/scan_view.dart';
import 'package:magic_free_disk_space/section/advice_card.dart';
import 'package:magic_free_disk_space/section/item_group_card.dart';

import '../shell/support/stage_harness.dart';

List<int> _listNumbers(List<ItemView> items) {
  return [for (final ItemView item in items) item.number];
}

void main() {
  final ScannedEvent sampleScan = loadSampleScan();

  group('buildSectionContents', () {
    test('sorts the items of a section into their groups', () {
      final SectionContents caches = buildSectionContents(
        sampleScan,
        SectionKey.caches,
      );

      expect(_listNumbers(caches.getGroupItems(ShownItemGroup.safe)), [1]);
      expect(_listNumbers(caches.getGroupItems(ShownItemGroup.review)), [2]);
      expect(caches.getGroupItems(ShownItemGroup.careful), isEmpty);
      expect(caches.adviceItems, isEmpty);
    });

    test('takes the Explore items and the advice of their section', () {
      final SectionContents developerTools = buildSectionContents(
        sampleScan,
        SectionKey.developerTools,
      );

      expect(_listNumbers(developerTools.getGroupItems(ShownItemGroup.review)), [6]);
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
      expect(getShownItemGroup(ItemGroup.unknown), ShownItemGroup.review);
    });
  });

  test('listSelectedItems and sumItemSizes add up the selection', () {
    final List<ItemView> selected = listSelectedItems(sampleScan, {1, 2});

    expect(_listNumbers(selected), [1, 2]);
    final ItemSizeSum selectedSize = sumItemSizes(selected);
    expect(selectedSize.allocatedBytes, 10000000);
    expect(selectedSize.isComplete, isFalse);
    final ItemSizeSum emptySize = sumItemSizes(const []);
    expect(emptySize.allocatedBytes, 0);
    expect(emptySize.isComplete, isTrue);
  });

  group('section totals', () {
    test('merge the totals of keys this app does not know, in key order', () {
      const SectionTotal futureThings = SectionTotal(
        sectionKey: SectionKey.unknown,
        allocatedBytes: 3000000,
        itemCount: 1,
        safeBytes: 0,
        adviceCount: 0,
      );
      const SectionTotal otherFuture = SectionTotal(
        sectionKey: SectionKey.unknown,
        allocatedBytes: 2000000,
        itemCount: 2,
        safeBytes: 1000000,
        adviceCount: 1,
      );
      const SectionTotal caches = SectionTotal(
        sectionKey: SectionKey.caches,
        allocatedBytes: 1000000,
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
        SectionKey.caches,
        SectionKey.unknown,
      ]);
      final SectionTotal unknown = merged.last;
      expect(unknown.allocatedBytes, 5000000);
      expect(unknown.itemCount, 3);
      expect(unknown.safeBytes, 1000000);
      expect(unknown.adviceCount, 1);
    });

    test('say how many items a section holds', () {
      final List<SectionTotal> totals = sampleScan.sectionTotals;

      expect(
        formatSectionCountText(findSectionTotal(totals, SectionKey.caches)!),
        '2 items',
      );
      expect(
        formatSectionCountText(findSectionTotal(totals, SectionKey.developerTools)!),
        '1 item · 1 to handle yourself',
      );
      expect(findSectionTotal(totals, SectionKey.trash), isNull);
    });
  });

  group('section titles', () {
    test('take the bridge title of a key this app does not know', () {
      final Map<String, Object?> json = loadSampleScanJson();
      final Map<String, Object?> largeFiles = (json['sections']! as List<Object?>)
          .cast<Map<String, Object?>>()
          .singleWhere((Map<String, Object?> section) => section['key'] == 'largeFiles');
      largeFiles['key'] = 'futureThings';
      largeFiles['titleText'] = 'Future things';
      final ScannedEvent scan = parseScanJson(json);

      expect(formatScanSectionTitle(SectionKey.unknown, scan: scan), 'Future things');
      expect(formatScanSectionTitle(SectionKey.unknown, scan: sampleScan), 'Other items');
      expect(formatScanSectionTitle(SectionKey.unknown, scan: null), 'Other items');
      expect(formatScanSectionTitle(SectionKey.caches, scan: scan), 'Caches');
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
      final ItemView xcode = sampleScan.selectableItems.singleWhere(
        (ItemView item) => item.number == 3,
      );
      final ItemView oldVideo = sampleScan.selectableItems.singleWhere(
        (ItemView item) => item.number == 5,
      );

      expect(formatItemFactsText(xcode, now: now), 'Xcode · Last used 5 months ago');
      expect(formatItemFactsText(oldVideo, now: now), 'Last used 3 months ago');
    });
  });

  group('the group toggle', () {
    test('shows all, none, or some of its items ticked', () {
      expect(findGroupSelectValue([1, 2], {1, 2}), isTrue);
      expect(findGroupSelectValue([1, 2], {}), isFalse);
      expect(findGroupSelectValue([1, 2], {2, 7}), isNull);
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
