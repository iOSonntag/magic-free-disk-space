import type { ExploreUnit } from '../explore/exploreUnit.js';
import { listUnitPaths } from '../explore/exploreUnit.js';
import type { EntryReads } from '../system/entryReads.js';
import { loadPathMeasurement } from './loadPathMeasurement.js';

/** One tally over a unit's paths; a path that is gone counts 0. */
export type UnitMeasurement = {
  /** Each block once, as `PathMeasurement` counts it: a link split across two paths counts once. */
  allocatedBytes: number;
  entryCount: number;
  /** Files whose private size could not be read, so their allocated blocks count instead. */
  privateSizeFallbackCount: number;
  /** False when a path was unreadable in part or the deadline passed. */
  isComplete: boolean;
  /**
   * True when a path is a mount point or holds another mounted volume; a path that is gone or
   * unreadable counts false.
   */
  holdsOtherVolume: boolean;
};

/** Measures the paths of `listUnitPaths(unit)`, for the scan's offer and before and after a run. */
export async function loadUnitMeasurement(params: {
  unit: ExploreUnit;
  deadlineMs: number;
  entryReads: EntryReads;
}): Promise<UnitMeasurement> {
  const measured = await loadPathMeasurement({
    paths: listUnitPaths(params.unit),
    deadlineMs: params.deadlineMs,
    entryReads: params.entryReads,
  });

  return {
    allocatedBytes: measured.allocatedBytes,
    entryCount: measured.entryCount,
    privateSizeFallbackCount: measured.privateSizeFallbackCount,
    isComplete: measured.isComplete,
    holdsOtherVolume: measured.holdsOtherVolume,
  };
}
