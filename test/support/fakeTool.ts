import { rmSync } from 'node:fs';
import { chmod, link, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let windowsLauncherPath: Promise<string> | null = null;

/**
 * Writes a fake tool named `name` into `folder`, creating the folder, and returns the path to
 * spawn. Its `body` is TypeScript that the Bun of the tests runs with the tool's arguments and
 * environment. On POSIX it is a script at `mode` (0o755 without it); on Windows a launcher `.exe`
 * that runs the body beside it as a child, where `mode` has no effect: there the spawned pid is
 * the launcher's, and a kill of it does not reach the body.
 */
export async function createFakeTool(params: {
  folder: string;
  name: string;
  body: string;
  mode?: number;
}): Promise<string> {
  await mkdir(params.folder, { recursive: true });

  if (process.platform === 'win32') {
    return createWindowsFakeTool({ folder: params.folder, name: params.name, body: params.body });
  }

  const path = join(params.folder, params.name);

  await writeFile(path, `#!${process.execPath}\n${params.body}\n`);
  // An explicit chmod, because the mode of `writeFile` passes through the umask.
  await chmod(path, params.mode ?? 0o755);

  return path;
}

async function createWindowsFakeTool(params: {
  folder: string;
  name: string;
  body: string;
}): Promise<string> {
  const path = join(params.folder, `${params.name}.exe`);

  await writeFile(join(params.folder, `${params.name}.ts`), `${params.body}\n`);
  windowsLauncherPath ??= compileWindowsLauncher();
  await link(await windowsLauncherPath, path);

  return path;
}

/**
 * Compiles, once per test process, the launcher every Windows fake tool is a hard link of: it
 * runs the `.ts` body beside its own path with this Bun and exits with the body's exit code.
 */
async function compileWindowsLauncher(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-fake-tool-'));
  const sourcePath = join(folder, 'launcher.ts');
  const launcherPath = join(folder, 'launcher.exe');
  const launcherSource = `import { spawnSync } from 'node:child_process';

const bodyPath = process.execPath.replace(/\\.exe$/i, '.ts');
const run = spawnSync(${JSON.stringify(process.execPath)}, [bodyPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

if (run.error) {
  console.error(run.error);
}

process.exit(run.status ?? 1);
`;

  process.on('exit', () => {
    rmSync(folder, { recursive: true, force: true });
  });
  await writeFile(sourcePath, launcherSource);

  const build = Bun.spawnSync({
    cmd: [process.execPath, 'build', sourcePath, '--compile', '--outfile', launcherPath],
    stdout: 'ignore',
    stderr: 'pipe',
  });

  if (build.exitCode !== 0) {
    throw new Error(`The fake tool launcher did not compile: ${build.stderr.toString()}`);
  }

  return launcherPath;
}
