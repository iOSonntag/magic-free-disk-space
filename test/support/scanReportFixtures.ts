import type { CloudOnlyEntryCount, ScanReport } from '../../src/scan/runScan.js';
import { createCloudOnlyEntryTally } from '../../src/scan/runScan.js';
import type { ScanPlatformCloudOnlyEntries } from '../../src/scan/scanPlatform.js';

export const EMPTY_REPORT: ScanReport = {
  candidates: [],
  safeNumbers: [],
  advice: [],
  appAdvice: null,
  skipped: [],
  cloudOnlyEntries: null,
  issues: [],
};

/**
 * What the report of a scan whose platform treats cloud-only entries as `cloudOnlyEntries` says
 * after its walks left each file of `entryPaths` unread in the cloud store.
 */
export function countTestCloudOnlyEntries(params: {
  cloudOnlyEntries: ScanPlatformCloudOnlyEntries;
  entryPaths: string[];
}): CloudOnlyEntryCount | null {
  const tally = createCloudOnlyEntryTally({ cloudOnlyEntries: params.cloudOnlyEntries });

  if (tally === null) {
    return null;
  }

  for (const entryPath of params.entryPaths) {
    tally.recordEvictedEntry({ path: entryPath, kind: 'file' });
  }

  return tally.getCloudOnlyEntryCount();
}
