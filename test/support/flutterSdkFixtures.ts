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

/** Writes the active-roots file `<group>/<name>` under `homeDir` that names `packageConfigPath`. */
export async function writeActiveRoot(params: {
  homeDir: string;
  group: string;
  name: string;
  packageConfigPath: string;
}): Promise<void> {
  await Bun.write(
    buildActiveRootPath({ homeDir: params.homeDir, group: params.group, name: params.name }),
    JSON.stringify({ package_config: pathToFileURL(params.packageConfigPath).href }),
  );
}

/** The folder `<homeDir>/projects/<name>` of the project that `createActiveProject` writes. */
export function buildProjectRoot(params: { homeDir: string; name: string }): string {
  return join(params.homeDir, 'projects', params.name);
}

/**
 * Writes a project at `projectRoot`, else at `<homeDir>/projects/<name>`, whose package config
 * names `flutterRoot`, the active-roots file `<group>/<name>` that names that package config, and
 * the `.git` entry of `flutterRoot`, a folder without `flutterRootGitEntry`. Unless
 * `includeProjectRepository` is `false`, the project is a git repository whose v2 index names
 * only `pubspec.yaml`.
 */
export async function createActiveProject(params: {
  homeDir: string;
  group: string;
  name: string;
  flutterRoot: string;
  flutterRootGitEntry?: GitEntry;
  projectRoot?: string;
  includeProjectRepository?: boolean;
}): Promise<void> {
  const projectRoot =
    params.projectRoot ?? buildProjectRoot({ homeDir: params.homeDir, name: params.name });
  const packageConfigPath = join(projectRoot, '.dart_tool', 'package_config.json');

  await Bun.write(
    packageConfigPath,
    JSON.stringify({ configVersion: 2, flutterRoot: pathToFileURL(params.flutterRoot).href }),
  );
  await writeActiveRoot({
    homeDir: params.homeDir,
    group: params.group,
    name: params.name,
    packageConfigPath: packageConfigPath,
  });

  if (params.includeProjectRepository !== false) {
    await createGitIndex({
      gitDir: join(projectRoot, '.git'),
      version: 2,
      paths: ['pubspec.yaml'],
    });
  }

  await createGitEntry({
    folder: params.flutterRoot,
    gitEntry: params.flutterRootGitEntry ?? 'folder',
  });
}

/** Writes `gitEntry` as the `.git` entry of `folder`, with `folder`; `none` writes nothing. */
export async function createGitEntry(params: {
  folder: string;
  gitEntry: GitEntry;
}): Promise<void> {
  const gitPath = join(params.folder, '.git');

  switch (params.gitEntry) {
    case 'folder':
      await mkdir(gitPath, { recursive: true });
      return;
    case 'file':
      await mkdir(params.folder, { recursive: true });
      await writeFile(gitPath, 'gitdir: ../flutter.git/worktrees/stable\n');
      return;
    case 'none':
      return;
  }
}

/** The `.git` entry of a folder: a clone's folder, the file of a worktree or a submodule, or none. */
export type GitEntry = 'folder' | 'file' | 'none';

/**
 * The bytes of a git index of `version` whose entries name `paths`, with zero stat data and
 * hashes: version 2 and 3 pad each entry with NUL bytes to a multiple of 8, version 4 strips no
 * prefix and pads with one NUL.
 */
export function buildGitIndexBytes(params: {
  version: GitIndexVersion;
  paths: string[];
}): Uint8Array {
  const header = new Uint8Array(12);
  const headerView = new DataView(header.buffer);
  header.set(new TextEncoder().encode('DIRC'), 0);
  headerView.setUint32(4, params.version);
  headerView.setUint32(8, params.paths.length);

  const entries = params.paths.map((path) =>
    buildGitIndexEntry({ version: params.version, path: path }),
  );

  return concatBytes([header, ...entries, new Uint8Array(20)]);
}

/** Writes `<gitDir>/index`, a git index of `version` whose entries name `paths`. */
export async function createGitIndex(params: {
  gitDir: string;
  version: GitIndexVersion;
  paths: string[];
}): Promise<void> {
  await Bun.write(
    join(params.gitDir, 'index'),
    buildGitIndexBytes({ version: params.version, paths: params.paths }),
  );
}

export type GitIndexVersion = 2 | 3 | 4;

const GIT_INDEX_ENTRY_FIXED_LENGTH = 62;

function buildGitIndexEntry(params: { version: GitIndexVersion; path: string }): Uint8Array {
  const name = new TextEncoder().encode(params.path);
  const fixed = new Uint8Array(GIT_INDEX_ENTRY_FIXED_LENGTH);
  new DataView(fixed.buffer).setUint16(60, Math.min(name.length, 0xfff));

  if (params.version === 4) {
    return concatBytes([fixed, new Uint8Array([0]), name, new Uint8Array(1)]);
  }

  const paddingLength = 8 - ((GIT_INDEX_ENTRY_FIXED_LENGTH + name.length) % 8);

  return concatBytes([fixed, name, new Uint8Array(paddingLength)]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes;
}

/** Writes `version` as the version file of the Dart SDK whose binary is at `dartPath`. */
export async function writeDartVersionFile(params: {
  dartPath: string;
  version: string;
}): Promise<void> {
  await Bun.write(join(dirname(dirname(params.dartPath)), 'version'), `${params.version}\n`);
}
