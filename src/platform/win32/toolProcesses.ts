import { spawn } from 'node:child_process';
import type { Result } from '../../result.js';
import type { StartedTool, ToolProcess, ToolProcessPlatform } from '../../tools/toolsPlatform.js';
import type { Win32CallFailure, WindowsHandle } from './win32Api.js';
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

/**
 * The profile and the temporary folder of the run, and `SystemRoot`, without which a program
 * cannot load the libraries of Windows, with the system's folders in `PATH`.
 */
export function buildBaseEnvironment(params: {
  toolFolderPath: string;
  homeDir: string;
  tempDir: string;
}): Record<string, string> {
  const systemRoot = process.env.SystemRoot;
  const systemEntries: Record<string, string> =
    systemRoot === undefined ? {} : { SystemRoot: systemRoot };
  const systemPathDirs = systemRoot === undefined ? [] : [`${systemRoot}\\System32`, systemRoot];

  return {
    USERPROFILE: params.homeDir,
    TEMP: params.tempDir,
    TMP: params.tempDir,
    ...systemEntries,
    PATH: [params.toolFolderPath, ...systemPathDirs].join(';'),
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
    return { kind: 'failed', failure: formatCallFailure({ failure: job.failure }) };
  }

  let child: ToolProcess;

  try {
    child = spawn(params.path, params.args, {
      cwd: params.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: params.env,
      windowsHide: true,
    });
  } catch (error) {
    closeHandle({ handle: job.value });

    return { kind: 'failed', failure: error instanceof Error ? error.message : String(error) };
  }

  // A tool that did not start has no id; the error it emits settles its run.
  if (child.pid !== undefined) {
    const assigned = assignProcessToJob({ job: job.value, processId: child.pid });

    if (assigned.kind === 'failed') {
      child.kill('SIGKILL');
      closeHandle({ handle: job.value });

      return { kind: 'failed', failure: formatCallFailure({ failure: assigned.failure }) };
    }
  }

  return { kind: 'succeeded', value: holdInJob({ child: child, job: job.value }) };
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

function formatCallFailure(params: { failure: Win32CallFailure }): string {
  return `${params.failure.call} failed with ${params.failure.code}`;
}
