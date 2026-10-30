import type { ExploreUnit } from '../explore/exploreUnit.js';
import { listUnitPaths } from '../explore/exploreUnit.js';
import { createConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';

/** The sum over a unit's paths; a path that is gone counts 0. */
export type UnitMeasurement = {
  allocatedBytes: number;
  entryCount: number;
  /** False when a path was unreadable in part or the deadline passed. */
  isComplete: boolean;
  /**
   * True when a path is a mount point or holds another mounted volume; a path that is gone or
   * unreadable counts false.
   */
  holdsOtherVolume: boolean;
};

type PathMeasurementPart = UnitMeasurement;

const MISSING_PATH_PART: PathMeasurementPart = {
  allocatedBytes: 0,
  entryCount: 0,
  isComplete: true,
  holdsOtherVolume: false,
};

const UNREADABLE_PATH_PART: PathMeasurementPart = {
  allocatedBytes: 0,
  entryCount: 0,
  isComplete: false,
  holdsOtherVolume: false,
};

/** Paths measured at once; a Dart gc set holds thousands of small folders. */
const MAX_CONCURRENT_PATHS = 8;

/** Measures the paths of `listUnitPaths(unit)`, for the scan's offer and before and after a run. */
export async function loadUnitMeasurement(params: {
  unit: ExploreUnit;
  deadlineMs: number;
}): Promise<UnitMeasurement> {
  const runPathMeasurement = createConcurrencyLimit({ maxConcurrent: MAX_CONCURRENT_PATHS });
  const parts = await Promise.all(
    listUnitPaths(params.unit).map((path) =>
      runPathMeasurement(() =>
        loadPathMeasurementPart({ path: path, deadlineMs: params.deadlineMs }),
      ),
    ),
  );

  return {
    allocatedBytes: parts.reduce((sum, part) => sum + part.allocatedBytes, 0),
    entryCount: parts.reduce((sum, part) => sum + part.entryCount, 0),
    isComplete: parts.every((part) => part.isComplete),
    holdsOtherVolume: parts.some((part) => part.holdsOtherVolume),
  };
}

async function loadPathMeasurementPart(params: {
  path: string;
  deadlineMs: number;
}): Promise<PathMeasurementPart> {
  const measured = await loadPathMeasurement({ path: params.path, deadlineMs: params.deadlineMs });

  if (measured.kind === 'succeeded') {
    return {
      allocatedBytes: measured.value.allocatedBytes,
      entryCount: measured.value.entryCount,
      isComplete: measured.value.isComplete,
      holdsOtherVolume: measured.value.holdsOtherVolume,
    };
  }

  if (measured.failure.reason === 'missing') {
    return MISSING_PATH_PART;
  }

  return UNREADABLE_PATH_PART;
}
