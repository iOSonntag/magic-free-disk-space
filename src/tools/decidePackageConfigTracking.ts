/** Whether a git index names `package_config.json`; `unknown` when the index cannot tell. */
export type PackageConfigTracking = 'tracked' | 'untracked' | 'unknown';

const GIT_INDEX_HEADER_LENGTH = 12;

const GIT_INDEX_SIGNATURE = 'DIRC';

export const PACKAGE_CONFIG_FILE_NAME = 'package_config.json';

const defaultIgnorableCodePoints = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * Whether the bytes of a git index of version 2 or 3 name `package_config.json` anywhere, after
 * ignorable code points are removed, NFKC, and lowercasing; `unknown` for any other bytes.
 */
export function decidePackageConfigTracking(indexBytes: Uint8Array): PackageConfigTracking {
  if (indexBytes.length < GIT_INDEX_HEADER_LENGTH) {
    return 'unknown';
  }

  const signature = new TextDecoder().decode(indexBytes.subarray(0, 4));

  if (signature !== GIT_INDEX_SIGNATURE) {
    return 'unknown';
  }

  const version = new DataView(indexBytes.buffer, indexBytes.byteOffset).getUint32(4);

  // Version 4 prefix-compresses the paths, which a literal search would miss.
  if (version !== 2 && version !== 3) {
    return 'unknown';
  }

  const foldedText = new TextDecoder()
    .decode(indexBytes)
    .replace(defaultIgnorableCodePoints, '')
    .normalize('NFKC')
    .toLowerCase();

  if (foldedText.includes(PACKAGE_CONFIG_FILE_NAME)) {
    return 'tracked';
  }

  return 'untracked';
}
