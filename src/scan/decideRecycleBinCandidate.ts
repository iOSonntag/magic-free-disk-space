import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { CandidateDecision, RecycleBinContent } from './candidate.js';
import type { ScanPlatformTrashRecycleBins } from './scanPlatform.js';

/** The folder at a drive root that Windows keeps every Recycle Bin of the drive in. */
const RECYCLE_BIN_FOLDER_NAME = '$Recycle.Bin';

/**
 * Offers the Recycle Bin of one drive as one item, at its folder at the drive root, so its path
 * holds no other item. An empty bin is no item, and a bin below `minOfferedBytes` is skipped.
 */
export function decideRecycleBinCandidate(params: {
  pathRules: PathRules;
  trash: ScanPlatformTrashRecycleBins;
  driveRootPath: AbsolutePath;
  content: RecycleBinContent;
  minOfferedBytes: number;
}): CandidateDecision[] {
  if (params.content.itemCount === 0) {
    return [];
  }

  const path = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.driveRootPath,
    names: [RECYCLE_BIN_FOLDER_NAME],
  });

  if (params.content.sizeBytes < params.minOfferedBytes) {
    return [{ kind: 'skip', path: path, reason: 'belowSizeThreshold' }];
  }

  return [
    {
      kind: 'offer',
      candidate: {
        path: path,
        title: `${params.trash.title} (${params.driveRootPath.slice(0, -1)})`,
        category: 'trash',
        risk: params.trash.risk,
        origin: { kind: 'recycleBin' },
        explanation: params.trash.explanation,
        regeneration: params.trash.regeneration,
        allocatedBytes: params.content.sizeBytes,
        entryCount: params.content.itemCount,
        isComplete: true,
        // The system counts the bin's size itself, so no entry's private size is read.
        privateSizeFallbackCount: 0,
        lastUsedAtMs: null,
        downloadedAtMs: null,
        appName: null,
        removal: {
          kind: 'emptyRecycleBin',
          driveRootPath: params.driveRootPath,
          scannedContent: params.content,
        },
      },
    },
  ];
}
