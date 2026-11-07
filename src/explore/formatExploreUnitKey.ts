import type { ExploreEngineUnit, ExploreUnit } from './exploreUnit.js';

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
    case 'downloadsInstallers':
    case 'downloadsIncomplete':
    case 'mailDownloads':
    case 'claudeCodeVersion':
    case 'lmStudioModel':
    case 'fvmVersion':
    case 'icloudFolder':
      return `${params.unit.kind}:${params.unit.folderPath}`;
    case 'vagrantBoxVersion':
      return `vagrantBoxVersion:${params.unit.name}/${params.unit.provider}@${params.unit.version}`;
    case 'rustupToolchain':
      return `rustupToolchain:${params.unit.name}`;
    case 'condaTarballs':
    case 'condaPackages':
      return params.unit.kind;
    case 'ollamaModel':
      return `ollamaModel:${params.unit.manifestPath}`;
    case 'huggingFaceRepository':
    case 'huggingFaceDetachedRevisions':
    case 'huggingFacePartialDownloads':
      return `${params.unit.kind}:${params.unit.repoPath}`;
    case 'claudeTranscripts':
      return `claudeTranscripts:${params.unit.projectFolderPath}`;
    case 'ideVersionFolder':
      return `ideVersionFolder:${params.unit.folderKind}:${params.unit.folderPath}`;
    case 'engineBuildCache':
    case 'engineDanglingImages':
      return `${params.unit.kind}:${formatEngineKey({ unit: params.unit })}`;
    case 'engineImage':
      return `engineImage:${formatEngineKey({ unit: params.unit })}:${params.unit.imageId}`;
    case 'engineContainer':
      return `engineContainer:${formatEngineKey({ unit: params.unit })}:${params.unit.containerId}`;
    case 'engineVolume':
      return `engineVolume:${formatEngineKey({ unit: params.unit })}:${params.unit.volumeName}`;
  }
}

/** The engine instance of a unit by its socket, since one engine, such as Colima, runs several. */
function formatEngineKey(params: { unit: ExploreEngineUnit }): string {
  return `${params.unit.engineProbeId}:${params.unit.socketPath}`;
}
