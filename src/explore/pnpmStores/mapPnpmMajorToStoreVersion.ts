import type { PnpmStoreVersion } from './parsePnpmStoreVersion.js';
import { parsePnpmStoreVersion } from './parsePnpmStoreVersion.js';

/** The store version a pnpm of this major uses; `null` for a major outside the known table. */
export function mapPnpmMajorToStoreVersion(params: { major: number }): PnpmStoreVersion | null {
  const folderName = selectStoreFolderName({ major: params.major });

  if (folderName === null) {
    return null;
  }

  const storeVersion = parsePnpmStoreVersion({ folderName: folderName });

  switch (storeVersion.kind) {
    case 'succeeded':
      return storeVersion.value;
    case 'failed':
      return null;
  }
}

function selectStoreFolderName(params: { major: number }): string | null {
  if (params.major >= 7 && params.major <= 9) {
    return 'v3';
  }

  if (params.major === 10) {
    return 'v10';
  }

  if (params.major === 11 || params.major === 12) {
    return 'v11';
  }

  return null;
}
