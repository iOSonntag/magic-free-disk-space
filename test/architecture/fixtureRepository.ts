import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Writes each file of `filesByPath` under a new temporary folder, creating its parent folders, and returns that folder. */
export async function createFixtureRepository(
  filesByPath: Record<string, string>,
): Promise<string> {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'fixture-repository-'));

  for (const [path, text] of Object.entries(filesByPath)) {
    await mkdir(dirname(join(fixtureDir, path)), { recursive: true });
    await writeFile(join(fixtureDir, path), text);
  }

  return fixtureDir;
}
