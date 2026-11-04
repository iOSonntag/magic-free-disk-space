import type { ScanReport } from '../../src/scan/runScan.js';

export const EMPTY_REPORT: ScanReport = {
  candidates: [],
  safeNumbers: [],
  advice: [],
  appAdvice: [],
  skipped: [],
  evictedEntryCount: 0,
  issues: [],
};
