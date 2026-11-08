declare const engineImageIdBrand: unique symbol;

declare const engineContainerIdBrand: unique symbol;

declare const engineVolumeNameBrand: unique symbol;

declare const engineBuildRecordIdBrand: unique symbol;

/** An image id of an engine's API, made only by the parser of its answer. */
export type EngineImageId = string & { [engineImageIdBrand]: true };

/** A container id of an engine's API, made only by the parser of its answer. */
export type EngineContainerId = string & { [engineContainerIdBrand]: true };

/** A volume name of an engine's API, made only by the parser of its answer. */
export type EngineVolumeName = string & { [engineVolumeNameBrand]: true };

/** A build cache record id of an engine's API, made only by the parser of its answer. */
export type EngineBuildRecordId = string & { [engineBuildRecordIdBrand]: true };
