import type { CatalogPlatform } from '../catalog/catalogPlatform.js';
import type { DeletePlatform } from '../delete/deletePlatform.js';
import type { EnvironmentPlatform } from '../environment/environmentPlatform.js';
import type { ExplorePlatform } from '../explore/explorePlatform.js';
import type { ReportTexts } from '../report/reportTexts.js';
import type { Result } from '../result.js';
import type { ScanPlatform } from '../scan/scanPlatform.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';

/** An operating system the app runs on, by the name `process.platform` gives it. */
export type PlatformId = 'darwin' | 'win32';

/** The run is on an operating system the app does not run on. */
export type UnsupportedPlatform = { reason: 'unsupportedPlatform' };

/**
 * Everything the app takes from one operating system: one slice per module that holds a fact of
 * it, typed by that module. Only the entry points hold the whole; each module gets its slice.
 * The path rules reach the modules inside `Environment`, which the environment slice loads.
 */
export type Platform = {
  environment: EnvironmentPlatform;
  catalog: CatalogPlatform;
  tools: ToolsPlatform;
  scan: ScanPlatform;
  delete: DeletePlatform;
  explore: ExplorePlatform;
  report: ReportTexts;
  system: SystemPlatform;
};

const PLATFORM_IDS: PlatformId[] = ['darwin', 'win32'];

/** The one maker of a `PlatformId`, from the text of `process.platform`. */
export function parsePlatformId(params: { text: string }): Result<PlatformId, UnsupportedPlatform> {
  const platformId = PLATFORM_IDS.find((candidate) => candidate === params.text);

  if (platformId === undefined) {
    return { kind: 'failed', failure: { reason: 'unsupportedPlatform' } };
  }

  return { kind: 'succeeded', value: platformId };
}
