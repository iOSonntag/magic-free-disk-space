import type { ExploreEngineUnit } from '../exploreUnit.js';
import {
  isDanglingImage,
  isStoppedContainer,
  isUnusedBuildRecord,
  isUnusedImage,
  isUnusedVolume,
} from './engineUnitRules.js';
import type { EngineDiskUsage } from './parseEngineDiskUsage.js';

/**
 * Whether the engine, read again, still has every id of the unit, unused as the probe found it.
 * Never busy apart from that, because the engine itself refuses to remove what it uses.
 */
export function isEngineUnitUnchanged(params: {
  unit: ExploreEngineUnit;
  usage: EngineDiskUsage;
  nowMs: number;
}): boolean {
  switch (params.unit.kind) {
    case 'engineBuildCache': {
      const records = params.usage.buildRecords;

      return (
        params.unit.recordIds.length > 0 &&
        params.unit.recordIds.every((recordId) => {
          const record = records.find((candidate) => candidate.id === recordId);

          return (
            record !== undefined &&
            isUnusedBuildRecord({ record: record, nowMs: params.nowMs }) &&
            // The prune filter matches an id as a pattern, so a record whose id holds it goes too.
            !records.some((other) => other.id !== recordId && other.id.includes(recordId))
          );
        })
      );
    }
    case 'engineDanglingImages':
      return (
        params.unit.imageIds.length > 0 &&
        params.unit.imageIds.every((imageId) => {
          const image = params.usage.images.find((candidate) => candidate.id === imageId);

          return image !== undefined && isDanglingImage(image);
        })
      );
    case 'engineImage': {
      const imageId = params.unit.imageId;
      const image = params.usage.images.find((candidate) => candidate.id === imageId);

      return image !== undefined && isUnusedImage(image);
    }
    case 'engineContainer': {
      const containerId = params.unit.containerId;
      const container = params.usage.containers.find((candidate) => candidate.id === containerId);

      return (
        container !== undefined &&
        isStoppedContainer(container) &&
        (container.writableSizeBytes ?? 0) === params.unit.sizeBytes
      );
    }
    case 'engineVolume': {
      const volumeName = params.unit.volumeName;
      const volume = params.usage.volumes.find((candidate) => candidate.name === volumeName);

      return (
        volume !== undefined && isUnusedVolume(volume) && volume.sizeBytes === params.unit.sizeBytes
      );
    }
  }
}
