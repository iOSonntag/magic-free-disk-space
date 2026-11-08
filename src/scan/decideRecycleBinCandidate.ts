import type { DriveRoot } from '../path/driveRoot.js';
import { joinAbsolutePath } from '../path/joinAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { CandidateDecision, RecycleBinContent } from './candidate.js';
import type { RecycleBinDescription } from './scanPlatform.js';

/**
 * Offers the Recycle Bin of one drive as one item, at the bin's folder at the drive root, so its
 * path holds no other item. An empty bin is no item, and a bin below `minOfferedBytes` is skipped.
 */
export function decideRecycleBinCandidate(params: {
  pathRules: PathRules;
  recycleBin: RecycleBinDescription;
  driveRoot: DriveRoot;
  content: RecycleBinContent;
  minOfferedBytes: number;
}): CandidateDecision[] {
  if (params.content.itemCount === 0) {
    return [];
  }

  const path = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.driveRoot,
    names: [params.recycleBin.binFolderName],
  });

  if (params.content.sizeBytes < params.minOfferedBytes) {
    return [{ kind: 'skip', path: path, reason: 'belowSizeThreshold' }];
  }

  return [
    {
      kind: 'offer',
      candidate: {
        path: path,
        title: `${params.recycleBin.title} (${params.driveRoot.slice(0, -1)})`,
        category: 'trash',
        risk: params.recycleBin.risk,
        origin: { kind: 'recycleBin' },
        explanation: params.recycleBin.explanation,
        regeneration: params.recycleBin.regeneration,
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
          driveRoot: params.driveRoot,
          scannedContent: params.content,
        },
      },
    },
  ];
}
