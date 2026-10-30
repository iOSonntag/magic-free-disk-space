import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The path of the pub active-roots file `<group>/<name>` under `homeDir`. */
export function buildActiveRootPath(params: {
  homeDir: string;
  group: string;
  name: string;
}): string {
  return join(params.homeDir, '.pub-cache', 'active_roots', params.group, params.name);
}

/** The folder `<homeDir>/projects/<name>` of the project that `createActiveProject` writes. */
export function buildProjectRoot(params: { homeDir: string; name: string }): string {
  return join(params.homeDir, 'projects', params.name);
}

/**
 * Writes a project `<homeDir>/projects/<name>` whose package config names `flutterRoot`, the
 * active-roots file `<group>/<name>` that names that package config, and the `.git` entry of
 * `flutterRoot`, a folder without `flutterRootGitEntry`.
 */
export async function createActiveProject(params: {
  homeDir: string;
  group: string;
  name: string;
  flutterRoot: string;
  flutterRootGitEntry?: FlutterRootGitEntry;
}): Promise<void> {
  const packageConfigPath = join(
    buildProjectRoot({ homeDir: params.homeDir, name: params.name }),
    '.dart_tool',
    'package_config.json',
  );

  await Bun.write(
    packageConfigPath,
    JSON.stringify({ configVersion: 2, flutterRoot: pathToFileURL(params.flutterRoot).href }),
  );
  await Bun.write(
    buildActiveRootPath({ homeDir: params.homeDir, group: params.group, name: params.name }),
    JSON.stringify({ package_config: pathToFileURL(packageConfigPath).href }),
  );
  await createFlutterRootGitEntry({
    flutterRoot: params.flutterRoot,
    gitEntry: params.flutterRootGitEntry ?? 'folder',
  });
}

async function createFlutterRootGitEntry(params: {
  flutterRoot: string;
  gitEntry: FlutterRootGitEntry;
}): Promise<void> {
  const gitPath = join(params.flutterRoot, '.git');

  switch (params.gitEntry) {
    case 'folder':
      await mkdir(gitPath, { recursive: true });
      return;
    case 'file':
      await mkdir(params.flutterRoot, { recursive: true });
      await writeFile(gitPath, 'gitdir: ../flutter.git/worktrees/stable\n');
      return;
    case 'none':
      return;
  }
}

/** The `.git` entry of a Flutter root: a clone's folder, a worktree's file, or none. */
export type FlutterRootGitEntry = 'folder' | 'file' | 'none';

/** Writes `version` as the version file of the Dart SDK whose binary is at `dartPath`. */
export async function writeDartVersionFile(params: {
  dartPath: string;
  version: string;
}): Promise<void> {
  await Bun.write(join(dirname(dirname(params.dartPath)), 'version'), `${params.version}\n`);
}
