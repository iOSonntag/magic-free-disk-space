import type { WindowsKnownFolder } from '../../environment/buildEnvironment.js';

/**
 * A known folder the run reads: the three that make its environment, or one it reads beside them.
 */
export type RunKnownFolder = 'profile' | 'localAppData' | 'roamingAppData' | WindowsKnownFolder;

/** The `KNOWNFOLDERID` of each known folder, as Microsoft's list of `FOLDERID_*` writes it. */
export const knownFolderIds: Record<RunKnownFolder, string> = {
  profile: '5E6C858F-0E22-4760-9AFE-EA3317B67173',
  localAppData: 'F1B32785-6FBA-4FCF-9D55-7B8E7F157091',
  roamingAppData: '3EB685DB-65F9-4CF6-A03A-E3EF65729F3D',
  desktop: 'B4BFCC3A-DB2C-424C-B029-7FE99A87C641',
  documents: 'FDD39AD0-238F-46AF-ADB4-6C85480369C7',
  downloads: '374DE290-123F-4565-9164-39C4925E467B',
  videos: '18989B1D-99B5-455B-841C-AB7C74E4DDFC',
  music: '4BD8D571-6D19-48D3-BE97-422220080E43',
  pictures: '33E28130-4E1E-4676-835A-98395C3BC3BB',
  localAppDataLow: 'A520A1A4-1780-4FF6-BD18-167343C5AF16',
  skyDrive: 'A52BBA46-E9E1-435f-B3D9-28DAA648C0F6',
};

/** A GUID in its registry form without braces: groups of 8, 4, 4, 4 and 12 hex digits. */
const guidPattern = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/i;

/**
 * The 16 bytes of a `GUID` struct for `text`: `Data1` to `Data3` little-endian, `Data4` in the
 * order written. Throws for a text that is no GUID, a bug of the table above.
 */
export function buildGuidBytes(params: { text: string }): Uint8Array {
  const groups = guidPattern.exec(params.text);

  if (groups === null) {
    throw new Error(`${params.text} is no GUID.`);
  }

  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, Number.parseInt(groups[1] ?? '', 16), true);
  view.setUint16(4, Number.parseInt(groups[2] ?? '', 16), true);
  view.setUint16(6, Number.parseInt(groups[3] ?? '', 16), true);
  bytes.set(Buffer.from(`${groups[4] ?? ''}${groups[5] ?? ''}`, 'hex'), 8);

  return bytes;
}
