import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { compareDottedVersions } from '../compareDottedVersions.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import type { VagrantBox } from './parseVagrantBoxList.js';

/** Where Vagrant keeps its boxes, below the home folder, unless `VAGRANT_HOME` moves it. */
const VAGRANT_BOXES_PATH_NAMES = ['.vagrant.d', 'boxes'];

/** Vagrant's folder name for the slash of a box name such as `hashicorp/bionic64`. */
const ESCAPED_SLASH = '-VAGRANTSLASH-';

/** A box version that a newer version of the same name, provider and architecture outdates. */
export type OutdatedVagrantBox = {
  box: VagrantBox;
  newestVersion: string;
};

/** Offers each outdated box version on its own, review, busy while `vagrant` runs. */
export function buildVagrantBoxFindings(params: {
  tool: LocatedTool;
  boxes: VagrantBox[];
  pathRules: PathRules;
  homeDir: AbsolutePath;
  processCommands: string[] | null;
}): ExploreFinding[] {
  const activity = decideUnitActivity({
    facts: { kind: 'vagrant' },
    processCommands: params.processCommands,
  });

  return listOutdatedVagrantBoxes(params.boxes).map((outdated) => {
    const box = outdated.box;
    const versionPath = buildVagrantBoxVersionPath({
      box: box,
      pathRules: params.pathRules,
      homeDir: params.homeDir,
    });

    return {
      unit: {
        kind: 'vagrantBoxVersion',
        tool: params.tool,
        name: box.name,
        provider: box.provider,
        version: box.version,
        versionPath: versionPath,
      },
      title: `Vagrant box ${box.name} ${box.version} (${box.provider})`,
      explanation: `An older version of a Vagrant box, outdated by version ${outdated.newestVersion}.`,
      regeneration: 'A Vagrantfile that asks for this version downloads it again.',
      risk: 'review',
      evidenceLines: [`Version ${outdated.newestVersion} of the same box is installed.`],
      displayPath: versionPath,
      activity: activity,
    };
  });
}

/**
 * Each version older than the newest of its name, provider and architecture. A version stored for
 * more than one architecture of its provider is left out, because `vagrant box remove` refuses it
 * without the `--architecture` the unit's command has no room for.
 */
export function listOutdatedVagrantBoxes(boxes: VagrantBox[]): OutdatedVagrantBox[] {
  return boxes.flatMap((box) => {
    const siblings = boxes.filter(
      (other) =>
        other.name === box.name &&
        other.provider === box.provider &&
        other.architecture === box.architecture,
    );
    const newestVersion = siblings
      .map((other) => other.version)
      .reduce((newest, version) => (compareDottedVersions(version, newest) > 0 ? version : newest));
    const architectureCount = boxes.filter(
      (other) =>
        other.name === box.name && other.provider === box.provider && other.version === box.version,
    ).length;

    if (compareDottedVersions(box.version, newestVersion) >= 0 || architectureCount > 1) {
      return [];
    }

    return [{ box: box, newestVersion: newestVersion }];
  });
}

/** `~/.vagrant.d/boxes/<name>/<version>/[<architecture>/]<provider>`, the folder the box fills. */
export function buildVagrantBoxVersionPath(params: {
  box: VagrantBox;
  pathRules: PathRules;
  homeDir: AbsolutePath;
}): AbsolutePath {
  const architectureNames = params.box.architecture === null ? [] : [params.box.architecture];

  return joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: [
      ...VAGRANT_BOXES_PATH_NAMES,
      params.box.name.replaceAll('/', ESCAPED_SLASH),
      params.box.version,
      ...architectureNames,
      params.box.provider,
    ],
  });
}
