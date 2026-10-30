import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings, UnitActivity } from '../exploreUnit.js';
import type { HomebrewOldVersions } from './buildHomebrewOldVersions.js';
import type { HomebrewOrphan, HomebrewState } from './loadHomebrewState.js';

/**
 * One finding per formula with old versions, and one for all orphans when there are any; not
 * complete while the orphans are not judged.
 */
export function buildHomebrewFindings(params: {
  tool: LocatedTool;
  state: HomebrewState;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const activity = decideUnitActivity({
    facts: { kind: 'homebrew' },
    processCommands: params.processCommands,
  });
  const oldVersionFindings = params.state.oldVersions.map((oldVersions) =>
    buildHomebrewOldVersionsFinding({
      tool: params.tool,
      cellarPath: params.state.cellarPath,
      oldVersions: oldVersions,
      activity: activity,
    }),
  );

  switch (params.state.orphans.kind) {
    case 'notJudged':
      return { findings: oldVersionFindings, isComplete: false };
    case 'judged': {
      if (params.state.orphans.orphans.length === 0) {
        return { findings: oldVersionFindings, isComplete: true };
      }

      const orphansFinding = buildHomebrewOrphansFinding({
        tool: params.tool,
        cellarPath: params.state.cellarPath,
        orphans: params.state.orphans.orphans,
        activity: activity,
      });

      return { findings: [...oldVersionFindings, orphansFinding], isComplete: true };
    }
  }
}

function buildHomebrewOldVersionsFinding(params: {
  tool: LocatedTool;
  cellarPath: AbsolutePath;
  oldVersions: HomebrewOldVersions;
  activity: UnitActivity;
}): ExploreFinding {
  const formula = params.oldVersions.formula;
  const versions = params.oldVersions.kegs.map((keg) => keg.version);

  return {
    unit: {
      kind: 'homebrewOldVersions',
      tool: params.tool,
      formula: formula,
      kegPaths: params.oldVersions.kegs.map((keg) => keg.path),
    },
    title: `Homebrew ${formula} ${versions.join(', ')}`,
    explanation:
      'Older versions of a Homebrew formula whose newest version is installed. `brew cleanup` also removes the cached downloads of the formula, which are not counted here.',
    regeneration: 'Not needed again: the newest version stays installed.',
    risk: 'review',
    evidenceLines: params.oldVersions.kegs.map(
      (keg) => `\`brew cleanup -n\` would remove ${formula} ${keg.version} (${keg.sizeText}).`,
    ),
    displayPath: `${params.cellarPath}/${formula}`,
    activity: params.activity,
  };
}

function buildHomebrewOrphansFinding(params: {
  tool: LocatedTool;
  cellarPath: AbsolutePath;
  orphans: HomebrewOrphan[];
  activity: UnitActivity;
}): ExploreFinding {
  const formulae = params.orphans.map((orphan) => orphan.formula);

  return {
    unit: {
      kind: 'homebrewOrphans',
      tool: params.tool,
      formulae: formulae,
      kegPaths: params.orphans.map((orphan) => orphan.kegPath),
    },
    title: `Homebrew orphans ${formulae.join(', ')}`,
    explanation:
      'Formulae Homebrew installed only as dependencies of formulae that are gone. One `brew autoremove` removes them all.',
    regeneration: 'Homebrew installs them again with a formula that needs them.',
    risk: 'review',
    evidenceLines: [
      `\`brew autoremove -n\` would remove ${formulae.length} ${formulae.length === 1 ? 'formula' : 'formulae'} that no installed formula needs.`,
      ...params.orphans.map((orphan) => `${orphan.formula} at ${orphan.kegPath}`),
    ],
    displayPath: params.cellarPath,
    activity: params.activity,
  };
}
