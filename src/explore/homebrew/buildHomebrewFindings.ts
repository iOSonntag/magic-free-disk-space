import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, UnitActivity } from '../exploreUnit.js';
import type { HomebrewOldVersions } from './buildHomebrewOldVersions.js';
import type { HomebrewState } from './loadHomebrewState.js';

/** One finding per formula with old versions, and one for all orphans when there are any. */
export function buildHomebrewFindings(params: {
  tool: LocatedTool;
  state: HomebrewState;
  processCommands: string[] | null;
}): ExploreFinding[] {
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

  if (params.state.orphans.length === 0) {
    return oldVersionFindings;
  }

  return [
    ...oldVersionFindings,
    buildHomebrewOrphansFinding({ tool: params.tool, state: params.state, activity: activity }),
  ];
}

function buildHomebrewOldVersionsFinding(params: {
  tool: LocatedTool;
  cellarPath: string;
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
  state: HomebrewState;
  activity: UnitActivity;
}): ExploreFinding {
  const formulae = params.state.orphans.map((orphan) => orphan.formula);

  return {
    unit: {
      kind: 'homebrewOrphans',
      tool: params.tool,
      formulae: formulae,
      kegPaths: params.state.orphans.map((orphan) => orphan.kegPath),
    },
    title: `Homebrew orphans ${formulae.join(', ')}`,
    explanation:
      'Formulae Homebrew installed only as dependencies of formulae that are gone. One `brew autoremove` removes them all.',
    regeneration: 'Homebrew installs them again with a formula that needs them.',
    risk: 'review',
    evidenceLines: [
      `\`brew autoremove -n\` would remove ${formulae.length} ${formulae.length === 1 ? 'formula' : 'formulae'} that no installed formula needs.`,
      ...params.state.orphans.map((orphan) => `${orphan.formula} at ${orphan.kegPath}`),
    ],
    displayPath: params.state.cellarPath,
    activity: params.activity,
  };
}
