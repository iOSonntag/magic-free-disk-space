import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadSourceImports } from './loadSourceImports.js';

async function createFixtureRepository(filesByPath: Record<string, string>): Promise<string> {
  const repositoryDir = await mkdtemp(join(tmpdir(), 'source-imports-'));

  for (const [path, text] of Object.entries(filesByPath)) {
    await mkdir(dirname(join(repositoryDir, path)), { recursive: true });
    await writeFile(join(repositoryDir, path), text);
  }

  return repositoryDir;
}

describe('loadSourceImports', () => {
  test('reads an import type, in a type alias and behind typeof', async () => {
    const repositoryDir = await createFixtureRepository({
      'src/cli/a.ts': `type V = import('../update/releaseVersion.js').ReleaseVersion;
type L = typeof import('../scan/limits.js');
`,
      'src/update/releaseVersion.ts': 'export type ReleaseVersion = string;\n',
      'src/scan/limits.ts': 'export const SCAN_LIMIT = 1;\n',
    });

    try {
      const imports = await loadSourceImports({ repositoryDir: repositoryDir });

      expect(imports).toEqual([
        { importerPath: 'src/cli/a.ts', importedPath: 'src/update/releaseVersion.ts', line: 1 },
        { importerPath: 'src/cli/a.ts', importedPath: 'src/scan/limits.ts', line: 2 },
      ]);
    } finally {
      await rm(repositoryDir, { recursive: true, force: true });
    }
  });

  test('reads a dynamic import of a string literal', async () => {
    const repositoryDir = await createFixtureRepository({
      'src/cli/a.ts': `export async function loadVersion(): Promise<unknown> {
  return import('../update/releaseVersion.js');
}
`,
      'src/update/releaseVersion.ts': 'export type ReleaseVersion = string;\n',
    });

    try {
      const imports = await loadSourceImports({ repositoryDir: repositoryDir });

      expect(imports).toEqual([
        { importerPath: 'src/cli/a.ts', importedPath: 'src/update/releaseVersion.ts', line: 2 },
      ]);
    } finally {
      await rm(repositoryDir, { recursive: true, force: true });
    }
  });

  test('throws for a dynamic import of a computed path, naming its file and line', async () => {
    const repositoryDir = await createFixtureRepository({
      'src/cli/a.ts': `export const version = 1;
export const loaded = import('' + '../update/releaseVersion.js');
`,
      'src/update/releaseVersion.ts': 'export type ReleaseVersion = string;\n',
    });

    try {
      await expect(loadSourceImports({ repositoryDir: repositoryDir })).rejects.toThrow(
        'src/cli/a.ts:2 imports a computed path',
      );
    } finally {
      await rm(repositoryDir, { recursive: true, force: true });
    }
  });
});
