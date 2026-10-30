import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import { formatHomeRelativePath } from '../formatHomeRelativePath.js';
import type { MisePrunableVersion } from './parseMisePrunableVersions.js';

export function buildMiseVersionFindings(params: {
  tool: LocatedTool;
  versions: MisePrunableVersion[];
  homeDir: string;
  processCommands: string[] | null;
}): ExploreFinding[] {
  return params.versions.map((version) => {
    const versionName = `${version.toolName}@${version.version}`;
    const finding: ExploreFinding = {
      unit: {
        kind: 'miseVersion',
        tool: params.tool,
        toolName: version.toolName,
        version: version.version,
        installPath: version.installPath,
      },
      title: `mise ${version.toolName} ${version.version}`,
      explanation: 'A tool version installed with mise that no config file mise tracks asks for.',
      regeneration: 'mise installs it again when a project asks for it.',
      risk: 'review',
      evidenceLines: [
        `\`mise prune\` would remove ${versionName}: no config file mise tracks pins this version.`,
        `Installed at ${formatHomeRelativePath({ path: version.installPath, homeDir: params.homeDir })}`,
      ],
      displayPath: version.installPath,
      activity: decideUnitActivity({
        facts: { kind: 'miseVersion' },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });
}
