import { spawn } from 'node:child_process';
import type { Result } from '../../result.js';
import { formatThrownError } from '../../system/formatThrownError.js';
import { formatSystemCallFailure } from '../../system/systemCallFailure.js';
import type { StartedTool, ToolProcess, ToolProcessPlatform } from '../../tools/toolsPlatform.js';
import type { WindowsHandle } from './win32Api.js';
import { assignProcessToJob, closeHandle, createKillOnCloseJob, terminateJob } from './win32Api.js';

/**
 * A tool runs in a job of its own that ends every process in it once its handle closes: when the
 * run settles, and when the app ends in any way, since Windows then closes its handles. The tool
 * joins its job right after its start, so a process it starts in that first moment escapes it.
 */
export const WIN32_TOOL_PROCESSES: ToolProcessPlatform = {
  buildBaseEnvironment: buildBaseEnvironment,
  startTool: startTool,
};

/** The base environment of a tool, with the `SystemRoot` of the app's own environment. */
function buildBaseEnvironment(params: {
  toolFolderPath: string;
  homeDir: string;
  tempDir: string;
}): Record<string, string> {
  return buildWin32BaseEnvironment({
    toolFolderPath: params.toolFolderPath,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    systemRoot: process.env.SystemRoot ?? null,
  });
}

/**
 * The profile and the temporary folder of the run, and `SystemRoot`, without which a program
 * cannot load the libraries of Windows, with the system's folders in `PATH` after the tool
 * folder; the tool folder alone for a `systemRoot` of `null`.
 */
export function buildWin32BaseEnvironment(params: {
  toolFolderPath: string;
  homeDir: string;
  tempDir: string;
  systemRoot: string | null;
}): Record<string, string> {
  if (params.systemRoot === null) {
    return {
      USERPROFILE: params.homeDir,
      TEMP: params.tempDir,
      TMP: params.tempDir,
      PATH: params.toolFolderPath,
    };
  }

  return {
    USERPROFILE: params.homeDir,
    TEMP: params.tempDir,
    TMP: params.tempDir,
    SystemRoot: params.systemRoot,
    PATH: [params.toolFolderPath, `${params.systemRoot}\\System32`, params.systemRoot].join(';'),
  };
}

/** A tool that cannot join its job is stopped at once, so none runs outside of one. */
function startTool(params: {
  path: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): Result<StartedTool, string> {
  const job = createKillOnCloseJob();

  if (job.kind === 'failed') {
    return { kind: 'failed', failure: formatSystemCallFailure({ failure: job.failure }) };
  }

  const spawned = spawnTool(params);

  if (spawned.kind === 'failed') {
    closeHandle({ handle: job.value });

    return { kind: 'failed', failure: spawned.failure };
  }

  const child = spawned.value;

  // A tool that did not start has no id; the error it emits settles its run.
  if (child.pid !== undefined) {
    const assigned = assignProcessToJob({ job: job.value, processId: child.pid });

    if (assigned.kind === 'failed') {
      child.kill('SIGKILL');
      closeHandle({ handle: job.value });

      return { kind: 'failed', failure: formatSystemCallFailure({ failure: assigned.failure }) };
    }
  }

  return { kind: 'succeeded', value: holdInJob({ child: child, job: job.value }) };
}

/** The tool's process, or the message of the error that the spawn threw. */
function spawnTool(params: {
  path: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): Result<ToolProcess, string> {
  try {
    const child = spawn(params.path, params.args, {
      cwd: params.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: params.env,
      windowsHide: true,
    });

    return { kind: 'succeeded', value: child };
  } catch (error) {
    return { kind: 'failed', failure: formatThrownError(error) };
  }
}

function holdInJob(params: { child: ToolProcess; job: WindowsHandle }): StartedTool {
  let isReleased = false;

  return {
    process: params.child,
    // A job already empty is no error; once released, closing its handle ended what was left.
    stop: () => {
      if (!isReleased) {
        terminateJob({ job: params.job });
      }
    },
    release: () => {
      if (!isReleased) {
        isReleased = true;
        closeHandle({ handle: params.job });
      }
    },
  };
}
