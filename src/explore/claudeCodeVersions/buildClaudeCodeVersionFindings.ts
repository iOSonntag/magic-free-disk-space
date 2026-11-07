import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import { decideClaudeCodeVersionOffers } from './decideClaudeCodeVersionOffers.js';
import type {
  ClaudeCodeVersionEntry,
  ClaudeCodeVersionState,
} from './loadClaudeCodeVersionState.js';

/** Offers each old version; nothing, and not complete, without the launcher's version. */
export function buildClaudeCodeVersionFindings(params: {
  state: ClaudeCodeVersionState;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  switch (params.state.kind) {
    case 'noVersions':
      return { findings: [], isComplete: true };
    case 'installed': {
      const offers = decideClaudeCodeVersionOffers({ state: params.state });

      if (offers === null) {
        return { findings: [], isComplete: false };
      }

      return {
        findings: offers.map((entry) =>
          buildClaudeCodeVersionFinding({ entry: entry, processCommands: params.processCommands }),
        ),
        isComplete: true,
      };
    }
  }
}

function buildClaudeCodeVersionFinding(params: {
  entry: ClaudeCodeVersionEntry;
  processCommands: string[] | null;
}): ExploreFinding {
  return {
    unit: {
      kind: 'claudeCodeVersion',
      folderPath: params.entry.path,
      version: params.entry.version,
    },
    title: `Claude Code ${params.entry.version}`,
    explanation: 'An older version of Claude Code that its installer left beside the newer ones.',
    regeneration: 'Claude Code downloads a version again only if you install that version.',
    risk: 'safe',
    evidenceLines: ['Two newer versions are installed, and the claude command runs another one.'],
    displayPath: params.entry.path,
    activity: decideUnitActivity({
      facts: { kind: 'claudeCodeVersion', versionPath: params.entry.path },
      processCommands: params.processCommands,
    }),
  };
}
