import { describe, expect, test } from 'bun:test';
import { SYSTEM_LOG_ENTRIES } from '../../../src/platform/darwin/catalog/systemLogs.js';
import { CATALOG_ENTRIES } from '../../../src/platform/darwin/catalogEntries.js';
import { SCAN_LIMITS } from '../../../src/scan/limits.js';
import { describeAwaitingWin32Platform } from '../../support/awaitsWin32Platform.js';
import { buildRiskAndPathById } from './catalogPins.js';
import { listCatalogOffers, withScannedCatalogHome } from './catalogScan.js';

/** A crash report of usual size, far below the smallest size offered. */
const CRASH_REPORT_BYTES = 102_400;

const CRASH_REPORT_COUNT = 30;

const LOG_BYTES = 65_536;

function findCatalogIndex(id: string): number {
  return CATALOG_ENTRIES.findIndex((entry) => entry.id === id);
}

describe('SYSTEM_LOG_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(SYSTEM_LOG_ENTRIES)).toEqual({
      'messages-attachment-previews': ['safe', 'Library/Messages/Caches/Previews/Attachments'],
      'messages-sticker-previews': ['safe', 'Library/Messages/Caches/Previews/StickerCache'],
      'messages-sticker-cache': ['safe', 'Library/Messages/StickerCache'],
      'metal-caches': ['safe', ''],
      'user-logs': ['safe', 'Library/Logs'],
    });
  });

  test("the graphics caches are each app's Metal folders in the user cache, unchanged for a day", () => {
    expect(SYSTEM_LOG_ENTRIES.find((entry) => entry.id === 'metal-caches')).toMatchObject({
      root: 'userCache',
      selection: {
        kind: 'profileFolders',
        markerName: null,
        subpaths: ['com.apple.gpuarchiver', 'com.apple.metal', 'com.apple.metalfe'],
        rootSubpaths: [],
      },
      ageRule: { kind: 'unchangedDays', days: 1 },
    });
  });

  test("the app logs are each child of the home's logs, unchanged for the usual days", () => {
    expect(SYSTEM_LOG_ENTRIES.find((entry) => entry.id === 'user-logs')).toMatchObject({
      root: 'home',
      selection: { kind: 'children' },
      ageRule: { kind: 'unchangedDays', days: SCAN_LIMITS.defaultStaleDays },
    });
  });

  test("the simulator's logs come before the app logs, which give way to them", () => {
    expect(findCatalogIndex('core-simulator-logs')).toBeGreaterThanOrEqual(0);
    expect(findCatalogIndex('core-simulator-logs')).toBeLessThan(findCatalogIndex('user-logs'));
  });
});

describeAwaitingWin32Platform('the scan of the log entries', () => {
  test('offers the crash reports together, though each lies below the smallest size offered', async () => {
    await withScannedCatalogHome({
      entryIds: SYSTEM_LOG_ENTRIES.map((entry) => entry.id),
      files: Array.from({ length: CRASH_REPORT_COUNT }, (_, index) => ({
        path: `Library/Logs/DiagnosticReports/App-2026-01-01-${index}.ips`,
        sizeBytes: CRASH_REPORT_BYTES,
      })),
      minOfferedBytes: SCAN_LIMITS.minOfferedBytes,
      run: ({ homeDir, report }) => {
        expect(listCatalogOffers({ report: report, homeDir: homeDir })).toEqual([
          {
            entryId: 'user-logs',
            path: 'Library/Logs/DiagnosticReports',
            deletedPaths: ['Library/Logs/DiagnosticReports'],
          },
        ]);
        expect(report.candidates[0]?.allocatedBytes).toBeGreaterThanOrEqual(3_000_000);
      },
    });
  });

  test("leaves the simulator's logs to their own entry", async () => {
    await withScannedCatalogHome({
      entryIds: ['core-simulator-logs', 'user-logs'],
      files: [
        { path: 'Library/Logs/CoreSimulator/device/system.log', sizeBytes: LOG_BYTES },
        { path: 'Library/Logs/com.example.app/app.log', sizeBytes: LOG_BYTES },
      ],
      minOfferedBytes: 1,
      run: ({ homeDir, report }) => {
        const offers = listCatalogOffers({ report: report, homeDir: homeDir }).map(
          (offer) => `${offer.entryId}: ${offer.path}`,
        );

        expect(offers.toSorted()).toEqual([
          'core-simulator-logs: Library/Logs/CoreSimulator',
          'user-logs: Library/Logs/com.example.app',
        ]);
      },
    });
  });
});
