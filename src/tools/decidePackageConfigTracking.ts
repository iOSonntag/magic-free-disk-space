import { isAbsolute, join } from 'node:path';

/** Whether a git index names `package_config.json`; `unknown` when the index cannot tell. */
export type PackageConfigTracking = 'tracked' | 'untracked' | 'unknown';

const GIT_INDEX_HEADER_LENGTH = 12;

const GIT_INDEX_SIGNATURE = 'DIRC';

const GIT_DIR_LINE_PREFIX = 'gitdir: ';

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

/**
 * The git dir that the first line `gitdir: <path>` of a `.git` file in `folder` names, a relative
 * path resolved against `folder`; `null` for any other text.
 */
export function parseGitDirFilePath(params: { text: string; folder: string }): string | null {
  const firstLine = params.text.split('\n')[0] ?? '';

  if (!firstLine.startsWith(GIT_DIR_LINE_PREFIX)) {
    return null;
  }

  const gitDirPath = firstLine.slice(GIT_DIR_LINE_PREFIX.length).trimEnd();

  if (gitDirPath === '') {
    return null;
  }

  if (isAbsolute(gitDirPath)) {
    return gitDirPath;
  }

  return join(params.folder, gitDirPath);
}
