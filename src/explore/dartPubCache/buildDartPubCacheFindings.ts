import { join } from 'node:path';
import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import { formatSamplePathLines } from '../formatHomeRelativePath.js';

const SAMPLE_PATH_MAX_COUNT = 3;

/** One finding for the whole gc set, none when the set is empty. */
export function buildDartPubCacheFindings(params: {
  tool: LocatedTool;
  gcPaths: string[];
  homeDir: string;
  processCommands: string[] | null;
}): ExploreFinding[] {
  if (params.gcPaths.length === 0) {
    return [];
  }

  const countText = params.gcPaths.length.toLocaleString('en-US');
  const finding: ExploreFinding = {
    unit: { kind: 'dartPubCache', tool: params.tool, gcPaths: params.gcPaths },
    title: 'Unused Dart and Flutter packages',
    explanation: 'Package versions in the pub cache that no active Dart or Flutter project uses.',
    regeneration: 'A project that needs one again downloads it on `pub get`.',
    risk: 'review',
    evidenceLines: [
      `\`dart pub cache gc\` would delete ${countText} cache entries, such as:`,
      ...formatSamplePathLines({
        paths: params.gcPaths,
        homeDir: params.homeDir,
        maxCount: SAMPLE_PATH_MAX_COUNT,
      }),
    ],
    displayPath: join(params.homeDir, '.pub-cache'),
    activity: decideUnitActivity({
      facts: { kind: 'dartPubCache' },
      processCommands: params.processCommands,
    }),
  };

  return [finding];
}
