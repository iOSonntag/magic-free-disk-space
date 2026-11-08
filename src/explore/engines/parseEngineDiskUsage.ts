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
  const tags = parseNameList({ value: value.RepoTags, placeholder: NO_TAG });
  const digests = parseNameList({ value: value.RepoDigests, placeholder: NO_DIGEST });
  const sizeBytes = parseCount({ value: value.Size });
  const sharedSizeBytes = parseCountOrUnset({ value: value.SharedSize });
  const containerCount = parseCountOrUnset({ value: value.Containers });

  if (typeof id !== 'string' || !IMAGE_ID_PATTERN.test(id)) {
    return null;
  }

  if (tags === null || digests === null || sizeBytes === null) {
    return null;
  }

  if (sharedSizeBytes.kind === 'invalid' || containerCount.kind === 'invalid') {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    id: id as EngineImageId,
    tags: tags,
    digests: digests,
    uniqueSizeBytes:
      sharedSizeBytes.kind === 'unset' ? sizeBytes : Math.max(sizeBytes - sharedSizeBytes.count, 0),
    containerCount: containerCount.kind === 'unset' ? null : containerCount.count,
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

  if (sizeBytes.kind === 'invalid' || referenceCount.kind === 'invalid') {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    name: name as EngineVolumeName,
    sizeBytes: sizeBytes.kind === 'unset' ? null : sizeBytes.count,
    referenceCount: referenceCount.kind === 'unset' ? null : referenceCount.count,
  };
}

function parseBuildRecord(value: unknown): EngineBuildRecord | null {
  if (!isJsonObject(value)) {
    return null;
  }

  const id = value.ID;
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

  if (typeof isInUse !== 'boolean' || typeof isShared !== 'boolean') {
    return null;
  }

  if (sizeBytes === null || lastUsedAtMs === null) {
    return null;
  }

  return {
    // The brand records the pattern check above, which the compiler cannot follow.
    id: id as EngineBuildRecordId,
    isInUse: isInUse,
    isShared: isShared,
    sizeBytes: sizeBytes,
    lastUsedAtMs: lastUsedAtMs,
  };
}

/** The strings of a list, `[]` for none, less `placeholder`; `null` for anything else. */
function parseNameList(params: { value: unknown; placeholder: string | null }): string[] | null {
  const names = parseRecordList({ value: params.value, parseRecord: parseName });

  return names === null ? null : names.filter((name) => name !== params.placeholder);
}

function parseName(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

type EngineCountCounted = { kind: 'counted'; count: number };

/** The engine's `-1` of "not counted". */
type EngineCountUnset = { kind: 'unset' };

type EngineCountInvalid = { kind: 'invalid' };

/** A count the engine may leave uncounted. */
type EngineCount = EngineCountCounted | EngineCountUnset | EngineCountInvalid;

function parseCountOrUnset(params: { value: unknown }): EngineCount {
  if (params.value === -1) {
    return { kind: 'unset' };
  }

  const count = parseCount({ value: params.value });

  return count === null ? { kind: 'invalid' } : { kind: 'counted', count: count };
}

function parseTimestampMs(params: { value: unknown }): number | null {
  if (typeof params.value !== 'string') {
    return null;
  }

  const timestampMs = Date.parse(params.value);

  return Number.isNaN(timestampMs) ? null : timestampMs;
}
