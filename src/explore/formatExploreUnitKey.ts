import type { ExploreUnit } from './exploreUnit.js';

/** Names a unit the same way in every scan, by what its own tool knows it by or by its folder. */
export function formatExploreUnitKey(params: { unit: ExploreUnit }): string {
  switch (params.unit.kind) {
    case 'simulatorDevice':
      return `simulatorDevice:${params.unit.udid}`;
    case 'dartPubCache':
      return 'dartPubCache';
    case 'miseVersion':
      return `miseVersion:${params.unit.miseToolName}@${params.unit.version}`;
    case 'simulatorRuntime':
      return `simulatorRuntime:${params.unit.runtimeId}`;
    case 'androidAvd':
      return `androidAvd:${params.unit.name}`;
    case 'homebrewOldVersions':
      return `homebrewOldVersions:${params.unit.formula}`;
    case 'homebrewOrphans':
      return `homebrewOrphans:${params.unit.formulae.join(',')}`;
    case 'asdfVersion':
      return `asdfVersion:${params.unit.asdfToolName}@${params.unit.version}`;
    case 'androidSystemImage':
    case 'androidEmulator':
    case 'vscodeExtension':
    case 'nvmVersion':
    case 'androidPlatform':
    case 'pnpmStore':
      return `${params.unit.kind}:${params.unit.folderPath}`;
  }
}
