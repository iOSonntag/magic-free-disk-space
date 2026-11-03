import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFixtureTextFile } from '../support/fixtureRoot.js';

/** Writes each file of `filesByPath` under a new temporary folder and returns that folder. */
export async function createFixtureRepository(
  filesByPath: Record<string, string>,
): Promise<string> {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'fixture-repository-'));

  for (const [path, text] of Object.entries(filesByPath)) {
    await writeFixtureTextFile({ path: join(fixtureDir, path), text: text });
  }

  return fixtureDir;
}
