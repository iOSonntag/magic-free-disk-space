import type { Result } from '../../result.js';
import { isJsonObject } from '../../system/parseJsonValue.js';
import type {
  EngineBuildRecordId,
  EngineContainerId,
  EngineImageId,
  EngineVolumeName,
} from './engineObjectIds.js';

export type EngineImageRecord = {
  id: EngineImageId;
  /** The image this one was built on, `''` for none. */
  parentId: string;
  /** Its `repository:tag` names, without the `<none>:<none>` placeholder. */
  tags: string[];
  /** Its `repository@digest` names, without the `<none>@<none>` placeholder. */
  digests: string[];
  /** The bytes only this image holds: its size less what it shares with other images. */
  uniqueSizeBytes: number;
  /** The containers of any state that use it; `null` when the engine did not count them. */
  containerCount: number | null;
};

export type EngineContainerRecord = {
  id: EngineContainerId;
  /** Its first name without the leading `/`; `null` when it has none. */
  name: string | null;
  /** Such as `running`, `exited` or `created`. */
  state: string;
  /** The bytes of its own writable layer; `null` when the engine did not measure it. */
  writableSizeBytes: number | null;
};

export type EngineVolumeRecord = {
  name: EngineVolumeName;
  /** `null` when its driver gives no size. */
  sizeBytes: number | null;
  /** The containers that mount it; `null` when the engine did not count them. */
  referenceCount: number | null;
};

export type EngineBuildRecord = {
  id: EngineBuildRecordId;
  /** Such as `regular`, `exec.cachemount` or `internal`. */
  recordType: string;
  isInUse: boolean;
  /** Shared with an image, so its removal frees nothing of the disk. */
  isShared: boolean;
  sizeBytes: number;
  /** When a build last used it, or made it when none used it since. */
  lastUsedAtMs: number;
};

/** The answer of `/system/df`; a list the request left out by its `type` reads as empty. */
export type EngineDiskUsage = {
  images: EngineImageRecord[];
  containers: EngineContainerRecord[];
  volumes: EngineVolumeRecord[];
  buildRecords: EngineBuildRecord[];
};

const IMAGE_ID_PATTERN = /^sha256:[0-9a-f]{64}$/;

const CONTAINER_ID_PATTERN = /^[0-9a-f]{64}$/;

/** Docker's own rule for a volume name; an anonymous volume's name is 64 hex digits, which it holds. */
const VOLUME_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** BuildKit's ids are base-36 letters and digits; the prune filter reads them as a pattern. */
const BUILD_RECORD_ID_PATTERN = /^[a-z0-9]+$/;

const NO_TAG = '<none>:<none>';

const NO_DIGEST = '<none>@<none>';

/** Reads the answer of `/system/df`; fails whole when any record fails, so none becomes a unit. */
export function parseEngineDiskUsage(params: { value: unknown }): Result<EngineDiskUsage, string> {
  if (!isJsonObject(params.value)) {
    return { kind: 'failed', failure: 'not an object' };
  }

  const images = parseRecordList({ value: params.value.Images, parseRecord: parseImageRecord });
  const containers = parseRecordList({
    value: params.value.Containers,
    parseRecord: parseContainerRecord,
  });
  const volumes = parseRecordList({ value: params.value.Volumes, parseRecord: parseVolumeRecord });
  const buildRecords = parseRecordList({
    value: params.value.BuildCache,
    parseRecord: parseBuildRecord,
  });

  if (images === null) {
    return { kind: 'failed', failure: 'an image record does not parse' };
  }

  if (containers === null) {
    return { kind: 'failed', failure: 'a container record does not parse' };
  }

  if (volumes === null) {
    return { kind: 'failed', failure: 'a volume record does not parse' };
  }

  if (buildRecords === null) {
    return { kind: 'failed', failure: 'a build cache record does not parse' };
  }

  return {
    kind: 'succeeded',
    value: {
      images: images,
      containers: containers,
      volumes: volumes,
      buildRecords: buildRecords,
    },
  };
}

/** The records of a list, `[]` for a list left out, and `null` when the list or a record fails. */
function parseRecordList<TRecord>(params: {
  value: unknown;
  parseRecord: (value: unknown) => TRecord | null;
}): TRecord[] | null {
  if (params.value === undefined || params.value === null) {
    return [];
  }

  if (!Array.isArray(params.value)) {
    return null;
  }

  const records: TRecord[] = [];

  for (const value of params.value) {
    const record = params.parseRecord(value);

    if (record === null) {
      return null;
    }

    records.push(record);
  }

  return records;
}

function parseImageRecord(value: unknown): EngineImageRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = value.Id;
  const parentId = value.ParentId;
  const tags = parseNameList({ value: value.RepoTags, placeholder: NO_TAG });
  const digests = parseNameList({ value: value.RepoDigests, placeholder: NO_DIGEST });
  const sizeBytes = parseCount({ value: value.Size });
  const sharedSizeBytes = parseCountOrUnset({ value: value.SharedSize });
  const containerCount = parseCountOrUnset({ value: value.Containers });

  if (typeof id !== 'string' || !IMAGE_ID_PATTERN.test(id)) {
    return null;
  }

  if (typeof parentId !== 'string' || tags === null || digests === null || sizeBytes === null) {
    return null;
  }

  if (sharedSizeBytes === undefined || containerCount === undefined) {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    id: id as EngineImageId,
    parentId: parentId,
    tags: tags,
    digests: digests,
    uniqueSizeBytes:
      sharedSizeBytes === null ? sizeBytes : Math.max(sizeBytes - sharedSizeBytes, 0),
    containerCount: containerCount,
  };
}

function parseContainerRecord(value: unknown): EngineContainerRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = value.Id;
  const state = value.State;
  const names = parseNameList({ value: value.Names, placeholder: null });
  const writableSizeBytes =
    value.SizeRw === undefined || value.SizeRw === null
      ? null
      : parseCount({ value: value.SizeRw });

  if (typeof id !== 'string' || !CONTAINER_ID_PATTERN.test(id)) {
    return null;
  }

  if (typeof state !== 'string' || names === null) {
    return null;
  }

  if (value.SizeRw !== undefined && value.SizeRw !== null && writableSizeBytes === null) {
    return null;
  }

  const firstName = names[0];

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    id: id as EngineContainerId,
    name: firstName === undefined ? null : firstName.replace(/^\//, ''),
    state: state,
    writableSizeBytes: writableSizeBytes,
  };
}

function parseVolumeRecord(value: unknown): EngineVolumeRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const name = value.Name;

  if (typeof name !== 'string' || !VOLUME_NAME_PATTERN.test(name)) {
    return null;
  }

  if (value.UsageData === undefined || value.UsageData === null) {
    // The brand records the pattern check above, which the compiler cannot follow.
    return { name: name as EngineVolumeName, sizeBytes: null, referenceCount: null };
  }

  if (!isJsonObject(value.UsageData)) {
    return null;
  }

  const sizeBytes = parseCountOrUnset({ value: value.UsageData.Size });
  const referenceCount = parseCountOrUnset({ value: value.UsageData.RefCount });

  if (sizeBytes === undefined || referenceCount === undefined) {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    name: name as EngineVolumeName,
    sizeBytes: sizeBytes,
    referenceCount: referenceCount,
  };
}

function parseBuildRecord(value: unknown): EngineBuildRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = value.ID;
  const recordType = value.Type;
  const isInUse = value.InUse;
  const isShared = value.Shared;
  const sizeBytes = parseCount({ value: value.Size });
  const createdAtMs = parseTimestampMs({ value: value.CreatedAt });
  const lastUsedAtMs =
    value.LastUsedAt === undefined || value.LastUsedAt === null
      ? createdAtMs
      : parseTimestampMs({ value: value.LastUsedAt });

  if (typeof id !== 'string' || !BUILD_RECORD_ID_PATTERN.test(id)) {
    return null;
  }

  if (typeof recordType !== 'string' || typeof isInUse !== 'boolean') {
    return null;
  }

  if (typeof isShared !== 'boolean' || sizeBytes === null || lastUsedAtMs === null) {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    id: id as EngineBuildRecordId,
    recordType: recordType,
    isInUse: isInUse,
    isShared: isShared,
    sizeBytes: sizeBytes,
    lastUsedAtMs: lastUsedAtMs,
  };
}

/** The strings of a list, `[]` for none, less `placeholder`; `null` for anything else. */
function parseNameList(params: { value: unknown; placeholder: string | null }): string[] | null {
  if (params.value === undefined || params.value === null) {
    return [];
  }

  if (!Array.isArray(params.value)) {
    return null;
  }

  const names: string[] = [];

  for (const name of params.value) {
    if (typeof name !== 'string') {
      return null;
    }

    if (name !== params.placeholder) {
      names.push(name);
    }
  }

  return names;
}

function parseCount(params: { value: unknown }): number | null {
  if (typeof params.value !== 'number' || !Number.isSafeInteger(params.value)) {
    return null;
  }

  if (params.value < 0) {
    return null;
  }

  return params.value;
}

/** A count, `null` for the engine's `-1` of "not counted", `undefined` for anything else. */
function parseCountOrUnset(params: { value: unknown }): number | null | undefined {
  if (params.value === -1) {
    return null;
  }

  return parseCount({ value: params.value }) ?? undefined;
}

function parseTimestampMs(params: { value: unknown }): number | null {
  if (typeof params.value !== 'string') {
    return null;
  }

  const timestampMs = Date.parse(params.value);

  return Number.isNaN(timestampMs) ? null : timestampMs;
}
