import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Writes a `/bin/sh` script named `name` with `body` into `folder`, creating the folder, at
 * `mode` (0o755 without it), and returns its path. The script sees only the tool environment.
 */
export async function createFakeTool(params: {
  folder: string;
  name: string;
  body: string;
  mode?: number;
}): Promise<string> {
  const path = join(params.folder, params.name);

  await mkdir(params.folder, { recursive: true });
  await writeFile(path, `#!/bin/sh\n${params.body}\n`);
  // An explicit chmod, because the mode of `writeFile` passes through the umask.
  await chmod(path, params.mode ?? 0o755);

  return path;
}
