import { beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLongPathSegments } from './longPath.js';
import {
  describeThrownError,
  formatNoticeCommand,
  formatProbeOutputLines,
  observeSafely,
  parseJsonObject,
} from './observations.js';

// Measures how Bun behaves on Windows and reports each observation as a GitHub notice, because
// the check-run annotations are what a session can read of a run. Only invariants are asserted:
// a failed observation is a fact to report, not a failed test.

const NOTICE_TITLE = 'Bun Windows fact';
const FIXTURES_FOLDER = join(import.meta.dir, 'fixtures');
const KERNEL_PROBE_PATH = join(FIXTURES_FOLDER, 'kernelProbe.ts');
const CLOUD_PLACEHOLDER_PROBE_PATH = join(FIXTURES_FOLDER, 'cloudPlaceholderProbe.ts');
const COMPILED_PROBE_ENTRY_PATH = join(FIXTURES_FOLDER, 'compiledProbe.ts');
const CHILD_TIMEOUT_MS = 60_000;
const COMPILED_PROBE_TIMEOUT_MS = 120_000;
const FACT_GROUP_TIMEOUT_MS = 150_000;
const COMPILED_PROBE_GROUP_TIMEOUT_MS = 300_000;
const STDERR_EXCERPT_MAX_LENGTH = 400;
const UNEXPECTED_STDOUT_EXCERPT_BYTES = 64;
const ECHO_LINE = 'Größe – 🧹';

// The flags the release compiles the bridge with, so the probe runs as the bridge does.
const COMPILED_PROBE_BUILD_FLAGS = [
  '--compile',
  '--windows-hide-console',
  '--windows-title',
  'Magic Free Disk Space',
  '--windows-publisher',
  'iOSonntag',
  '--windows-version',
  '0.0.0.0',
  '--windows-description',
  'Magic Free Disk Space bridge',
  '--windows-copyright',
  'Copyright © 2026 iOSonntag. MIT License.',
] as const;

type FactGroup =
  | 'links'
  | 'cloud placeholders'
  | 'rm of a tree'
  | 'long paths in Bun fs'
  | 'process ids and bun:ffi'
  | 'compiled probe';

type ChildRun = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: Uint8Array;
  stderr: string;
};

const emittedFactGroups = new Set<FactGroup>();
let runContextLine = 'context: not read';

const emitFactNotice = (group: FactGroup, lines: string[]): void => {
  const message = [runContextLine, `group: ${group}`, ...lines].join('\n');

  process.stdout.write(`${formatNoticeCommand({ title: NOTICE_TITLE, message: message })}\n`);
  emittedFactGroups.add(group);
};

const runChildProcess = async (params: {
  command: string[];
  stdin: Uint8Array | null;
  timeoutMs: number;
}): Promise<ChildRun> => {
  const child = Bun.spawn(params.command, {
    stdin: params.stdin === null ? 'ignore' : 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });

  if (params.stdin !== null && typeof child.stdin !== 'number' && child.stdin !== undefined) {
    child.stdin.write(params.stdin);
    await child.stdin.end();
  }

  const stdoutPromise = new Response(child.stdout).bytes();
  const stderrPromise = new Response(child.stderr).text();
  const outcome = await Promise.race([
    child.exited.then(() => 'exited' as const),
    Bun.sleep(params.timeoutMs).then(() => 'timedOut' as const),
  ]);

  if (outcome === 'timedOut') {
    child.kill();
  }

  await child.exited;

  return {
    exitCode: child.exitCode,
    timedOut: outcome === 'timedOut',
    stdout: await stdoutPromise,
    stderr: await stderrPromise,
  };
};

const runBunScript = (scriptPath: string, args: string[]): Promise<ChildRun> => {
  return runChildProcess({
    command: [process.execPath, scriptPath, ...args],
    stdin: null,
    timeoutMs: CHILD_TIMEOUT_MS,
  });
};

const formatChildEnd = (run: ChildRun): string[] => {
  const end = run.timedOut ? 'timed out and was killed' : `exitCode=${run.exitCode}`;
  const stderr = run.stderr.trim();

  if (stderr === '') {
    return [`child: ${end}`];
  }

  return [`child: ${end}`, `stderr: ${stderr.slice(0, STDERR_EXCERPT_MAX_LENGTH)}`];
};

const formatChildRun = (run: ChildRun): string[] => {
  return [...formatProbeOutputLines(new TextDecoder().decode(run.stdout)), ...formatChildEnd(run)];
};

/** The kernelProbe readings of `GetFileAttributesW` for the paths, as one line; never throws. */
const observeFileAttributesInChild = async (paths: string[]): Promise<string> => {
  const run = await runBunScript(KERNEL_PROBE_PATH, ['file-attributes', ...paths]);

  return formatChildRun(run).join(' | ');
};

const loadLongPathsEnabledContext = async (): Promise<string> => {
  const run = await runBunScript(KERNEL_PROBE_PATH, ['long-paths-setting']);
  const reading = parseJsonObject(new TextDecoder().decode(run.stdout).trim());

  if (reading !== null && reading.isRead === true) {
    return `${String(reading.value)} (RegGetValueW)`;
  }

  const regQuery = Bun.spawnSync([
    'reg',
    'query',
    'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    '/v',
    'LongPathsEnabled',
  ]);
  const regValue = /LongPathsEnabled\s+REG_DWORD\s+(0x[0-9a-f]+)/i.exec(regQuery.stdout.toString());
  const registryFailure = `RegGetValueW gave ${JSON.stringify(reading)}, ${formatChildEnd(run).join(' ')}`;

  if (regValue?.[1] === undefined) {
    return `unknown (${registryFailure}; reg query exitCode=${regQuery.exitCode})`;
  }

  return `${Number.parseInt(regValue[1], 16)} (reg query; ${registryFailure})`;
};

/** Removes the folder, through `rd /s /q` on the `\\?\` path when Bun's fs leaves it behind. */
const removeFolderBestEffort = async (path: string): Promise<boolean> => {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // The fallback below removes what Bun's rm could not.
  }

  if (existsSync(path)) {
    Bun.spawnSync(['cmd', '/c', 'rd', '/s', '/q', `\\\\?\\${path}`]);
  }

  return !existsSync(path);
};

const createTempFolder = (): Promise<string> => {
  return mkdtemp(join(tmpdir(), 'mfds-windows-facts-'));
};

const formatLstat = async (path: string): Promise<string> => {
  const stats = await lstat(path);

  return `isSymbolicLink=${stats.isSymbolicLink()} isDirectory=${stats.isDirectory()} isFile=${stats.isFile()}`;
};

/** Creates a junction, by `fs.symlink` and else by `mklink /J`, and returns how it was made. */
const createJunction = async (target: string, path: string): Promise<string> => {
  try {
    await symlink(target, path, 'junction');

    return 'fs.symlink junction';
  } catch (error) {
    const symlinkFailure = describeThrownError(error);
    const mklink = Bun.spawnSync(['cmd', '/c', 'mklink', '/J', path, target]);

    if (mklink.exitCode !== 0) {
      throw new Error(
        `fs.symlink junction ${symlinkFailure}; mklink /J exitCode=${mklink.exitCode}`,
      );
    }

    return `mklink /J (fs.symlink junction ${symlinkFailure})`;
  }
};

const isMissing = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);

    return false;
  } catch {
    return true;
  }
};

const observeLinks = async (folder: string): Promise<string[]> => {
  const target = join(folder, 'target');
  const junction = join(folder, 'junction');
  const directorySymlink = join(folder, 'directorySymlink');

  await mkdir(target);

  const junctionCreation = await observeSafely(() => createJunction(target, junction));
  const symlinkCreation = await observeSafely(async () => {
    await symlink(target, directorySymlink, 'dir');

    return 'ok';
  });

  return [
    `junction made by: ${junctionCreation}`,
    `junction lstat: ${await observeSafely(() => formatLstat(junction))}`,
    `dir symlink fs.symlink: ${symlinkCreation}`,
    `dir symlink lstat: ${await observeSafely(() => formatLstat(directorySymlink))}`,
    `plain dir lstat: ${await observeSafely(() => formatLstat(target))}`,
  ];
};

const observeTreeRemoval = async (params: { folder: string; force: boolean }): Promise<string> => {
  const tree = join(params.folder, 'tree');
  const outside = join(params.folder, 'outside');
  const sentinel = join(outside, 'sentinel.txt');
  const readOnlyFile = join(tree, 'readOnly.txt');

  await mkdir(outside, { recursive: true });
  await writeFile(sentinel, 'sentinel');
  await mkdir(tree, { recursive: true });
  await writeFile(readOnlyFile, 'read only');

  const chmodResult = await observeSafely(async () => {
    await chmod(readOnlyFile, 0o444);

    return 'ok';
  });
  const readOnlyAttributes = await observeFileAttributesInChild([readOnlyFile]);
  const junctionCreation = await observeSafely(() => {
    return createJunction(outside, join(tree, 'junctionOutside'));
  });
  const rmResult = await observeSafely(async () => {
    await rm(tree, { recursive: true, force: params.force });

    return 'ok';
  });

  return [
    `rm recursive force=${params.force}: ${rmResult}`,
    `  chmod 0o444: ${chmodResult}; attributes after: ${readOnlyAttributes}`,
    `  junction made by: ${junctionCreation}`,
    `  readOnlyFileGone=${await isMissing(readOnlyFile)} treeGone=${await isMissing(tree)} sentinelSurvived=${existsSync(sentinel)}`,
  ].join('\n');
};

const observeLongPaths = async (folder: string): Promise<string[]> => {
  const longFolder = join(folder, ...buildLongPathSegments());
  const longFile = join(longFolder, 'file.txt');

  return [
    `path length: ${longFile.length}, unprefixed`,
    `mkdir recursive: ${await observeSafely(async () => {
      await mkdir(longFolder, { recursive: true });

      return 'ok';
    })}`,
    `writeFile: ${await observeSafely(async () => {
      await writeFile(longFile, 'long path');

      return 'ok';
    })}`,
    `lstat: ${await observeSafely(() => formatLstat(longFile))}`,
    `readdir: ${await observeSafely(async () => {
      const entries = await readdir(longFolder);

      return `ok ${JSON.stringify(entries)}`;
    })}`,
    `GetFileAttributesW unprefixed, then \\\\?\\: ${await observeFileAttributesInChild([
      longFile,
      `\\\\?\\${longFile}`,
    ])}`,
    `rm recursive: ${await observeSafely(async () => {
      await rm(longFolder, { recursive: true });

      return 'ok';
    })}`,
  ];
};

const describeProcessIdFunction = (name: 'geteuid' | 'getuid'): string => {
  const candidate: unknown = Reflect.get(process, name);

  if (typeof candidate !== 'function') {
    return `typeof process.${name}=${typeof candidate}`;
  }

  return `typeof process.${name}=function value=${String(Reflect.apply(candidate, process, []))}`;
};

const observeCompiledProbe = async (folder: string): Promise<string[]> => {
  const executablePath = join(folder, 'compiledProbe.exe');
  const build = await runChildProcess({
    command: [
      process.execPath,
      'build',
      ...COMPILED_PROBE_BUILD_FLAGS,
      COMPILED_PROBE_ENTRY_PATH,
      '--outfile',
      executablePath,
    ],
    stdin: null,
    timeoutMs: COMPILED_PROBE_TIMEOUT_MS,
  });
  const buildLines = formatChildEnd(build).map((line) => `build ${line}`);

  if (build.exitCode !== 0) {
    return buildLines;
  }

  const input = new TextEncoder().encode(`1 ${ECHO_LINE}\n2 ${ECHO_LINE}\n`);
  const probeRun = await runChildProcess({
    command: [executablePath, folder],
    stdin: input,
    timeoutMs: COMPILED_PROBE_TIMEOUT_MS,
  });
  const echoed = probeRun.stdout.subarray(0, input.byteLength);
  const echoByteExact = Buffer.from(echoed).equals(Buffer.from(input));
  const echoLines = echoByteExact
    ? ['stdin echo byte-exact: true']
    : [
        'stdin echo byte-exact: false',
        `stdout first bytes: ${Buffer.from(probeRun.stdout.subarray(0, UNEXPECTED_STDOUT_EXCERPT_BYTES)).toString('hex')}`,
      ];
  const findings = echoByteExact ? probeRun.stdout.subarray(input.byteLength) : probeRun.stdout;

  return [
    ...buildLines,
    ...echoLines,
    `ended after stdin closed: ${!probeRun.timedOut}`,
    ...formatProbeOutputLines(new TextDecoder().decode(findings)),
    ...formatChildEnd(probeRun).map((line) => `probe ${line}`),
  ];
};

/**
 * Runs the observation in a fresh temp folder, emits its lines as the group's notice, and
 * returns whether the folder is gone afterwards. A thrown error becomes a line of the notice.
 */
const observeFactGroupInTempFolder = async (
  group: FactGroup,
  observe: (folder: string) => Promise<string[]>,
): Promise<boolean> => {
  const folder = await createTempFolder();
  const lines = await gatherObservationLines(() => observe(folder));
  const removed = await removeFolderBestEffort(folder);

  emitFactNotice(group, [...lines, `temp folder removed: ${removed}`]);

  return removed;
};

const gatherObservationLines = async (observe: () => Promise<string[]>): Promise<string[]> => {
  try {
    return await observe();
  } catch (error) {
    return [`observation ${describeThrownError(error)}`];
  }
};

describe.skipIf(process.platform !== 'win32')('Bun on Windows', () => {
  beforeAll(async () => {
    const longPathsEnabled = await observeSafely(() => loadLongPathsEnabledContext());

    runContextLine = `context: arch=${process.arch} LongPathsEnabled=${longPathsEnabled} bun=${Bun.version}`;
  }, CHILD_TIMEOUT_MS * 2);

  test(
    'lstat of a junction, a directory symlink and a plain folder',
    async () => {
      const removed = await observeFactGroupInTempFolder('links', observeLinks);

      expect(emittedFactGroups.has('links')).toBe(true);
      expect(removed).toBe(true);
    },
    FACT_GROUP_TIMEOUT_MS,
  );

  test(
    'cloud placeholders through cldapi',
    async () => {
      await observeFactGroupInTempFolder('cloud placeholders', async (folder) => {
        const syncRoot = join(folder, 'syncRoot');

        await mkdir(syncRoot);

        return formatChildRun(await runBunScript(CLOUD_PLACEHOLDER_PROBE_PATH, [syncRoot]));
      });

      // The placeholder root is removed best effort: a sync root may keep its folder.
      expect(emittedFactGroups.has('cloud placeholders')).toBe(true);
    },
    FACT_GROUP_TIMEOUT_MS,
  );

  test(
    'rm of a tree with a read-only file and a junction to the outside',
    async () => {
      const removed = await observeFactGroupInTempFolder('rm of a tree', async (folder) => {
        return [
          await observeTreeRemoval({ folder: join(folder, 'withoutForce'), force: false }),
          await observeTreeRemoval({ folder: join(folder, 'withForce'), force: true }),
        ];
      });

      expect(emittedFactGroups.has('rm of a tree')).toBe(true);
      expect(removed).toBe(true);
    },
    FACT_GROUP_TIMEOUT_MS,
  );

  test(
    'Bun fs on a path past 260 characters without \\\\?\\',
    async () => {
      const removed = await observeFactGroupInTempFolder('long paths in Bun fs', observeLongPaths);

      expect(emittedFactGroups.has('long paths in Bun fs')).toBe(true);
      expect(removed).toBe(true);
    },
    FACT_GROUP_TIMEOUT_MS,
  );

  test(
    'process ids and bun:ffi',
    async () => {
      const removed = await observeFactGroupInTempFolder(
        'process ids and bun:ffi',
        async (folder) => {
          const ffiReadings = await observeFileAttributesInChild([join(folder, 'missing'), folder]);

          return [
            `process ids: ${describeProcessIdFunction('geteuid')}; ${describeProcessIdFunction('getuid')}`,
            `bun:ffi GetFileAttributesW of a missing path, then a folder: ${ffiReadings}`,
          ];
        },
      );

      expect(emittedFactGroups.has('process ids and bun:ffi')).toBe(true);
      expect(removed).toBe(true);
    },
    FACT_GROUP_TIMEOUT_MS,
  );

  test(
    'a probe compiled with the flags of the bridge',
    async () => {
      const removed = await observeFactGroupInTempFolder('compiled probe', observeCompiledProbe);

      expect(emittedFactGroups.has('compiled probe')).toBe(true);
      expect(removed).toBe(true);
    },
    COMPILED_PROBE_GROUP_TIMEOUT_MS,
  );
});
