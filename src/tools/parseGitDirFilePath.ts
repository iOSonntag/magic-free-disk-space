import { isAbsolute, join } from 'node:path';

const GIT_DIR_LINE_PREFIX = 'gitdir: ';

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
