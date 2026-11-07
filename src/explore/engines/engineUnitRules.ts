import type {
  EngineBuildRecord,
  EngineContainerRecord,
  EngineImageRecord,
  EngineVolumeRecord,
} from './parseEngineDiskUsage.js';

/** A build cache record counts as unused once no build used it for this long. */
export const BUILD_RECORD_UNUSED_MS = 10 * 24 * 60 * 60 * 1000;

/** The states of a container that holds no process. */
const STOPPED_STATES = ['created', 'exited', 'dead'];

/** No build uses it now or lately, and an image shares none of its data. */
export function isUnusedBuildRecord(params: { record: EngineBuildRecord; nowMs: number }): boolean {
  return (
    !params.record.isInUse &&
    !params.record.isShared &&
    params.record.lastUsedAtMs <= params.nowMs - BUILD_RECORD_UNUSED_MS
  );
}

/** An image without a tag that the engine can remove by its id. */
export function isDanglingImage(image: EngineImageRecord): boolean {
  return image.tags.length === 0 && isUnusedImage(image);
}

/** An image with a tag that the engine can remove by its id. */
export function isUnusedTaggedImage(image: EngineImageRecord): boolean {
  return image.tags.length > 0 && isUnusedImage(image);
}

/**
 * No container of any state uses it, and its names lie in one repository at most: the engine
 * refuses, without `force`, to remove by its id an image named in several repositories.
 */
export function isUnusedImage(image: EngineImageRecord): boolean {
  const repositories = new Set(
    [...image.tags, ...image.digests].map((reference) => readReferenceRepository(reference)),
  );

  return image.containerCount === 0 && repositories.size <= 1;
}

export function isStoppedContainer(container: EngineContainerRecord): boolean {
  return STOPPED_STATES.includes(container.state);
}

/** No container mounts it, and its engine knows its size. */
export function isUnusedVolume(volume: EngineVolumeRecord): boolean {
  return volume.referenceCount === 0 && volume.sizeBytes !== null;
}

/** `localhost:5000/app` of `localhost:5000/app:1.2` or of `localhost:5000/app@sha256:…`. */
function readReferenceRepository(reference: string): string {
  const digestStart = reference.indexOf('@');

  if (digestStart !== -1) {
    return reference.slice(0, digestStart);
  }

  const tagStart = reference.lastIndexOf(':');

  return tagStart > reference.lastIndexOf('/') ? reference.slice(0, tagStart) : reference;
}
