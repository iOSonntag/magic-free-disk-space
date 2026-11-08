import type { RecycleBinContent } from '../scan/candidate.js';

/**
 * What a fresh count makes of a Recycle Bin the scan counted: `alreadyGone` once it holds nothing,
 * `changedSinceScan` once it holds other than the scan counted, else `unchanged`.
 */
type RecycleBinRecheck = 'alreadyGone' | 'changedSinceScan' | 'unchanged';

/**
 * Judges a fresh count of the bin against the scan's: only an `unchanged` bin may be emptied, since
 * one that gained items holds files the user never saw.
 */
export function decideRecycleBinRecheck(params: {
  scanned: RecycleBinContent;
  current: RecycleBinContent;
}): RecycleBinRecheck {
  if (params.current.itemCount === 0) {
    return 'alreadyGone';
  }

  if (
    params.current.itemCount !== params.scanned.itemCount ||
    params.current.sizeBytes !== params.scanned.sizeBytes
  ) {
    return 'changedSinceScan';
  }

  return 'unchanged';
}
