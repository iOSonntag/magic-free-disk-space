import { spawn } from 'node:child_process';
import type { Result } from '../../result.js';
import { formatThrownError } from '../../system/formatThrownError.js';
import { getErrorCode } from '../../system/getErrorCode.js';
import type { StartedTool, ToolProcess, ToolProcessPlatform } from '../../tools/toolsPlatform.js';

const SYSTEM_PATH_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/**
 * A tool runs in a process group of its own, which a kill of the group ends with every process the
 * tool started; the group needs no hold to let go of.
 */
export const DARWIN_TOOL_PROCESSES: ToolProcessPlatform = {
  buildBaseEnvironment: buildBaseEnvironment,
  startTool: startTool,
};

function buildBaseEnvironment(params: {
  toolFolderPath: string;
  homeDir: string;
  tempDir: string;
}): Record<string, string> {
  return {
    HOME: params.homeDir,
    TMPDIR: params.tempDir,
    LANG: 'en_US.UTF-8',
    PATH: [params.toolFolderPath, ...SYSTEM_PATH_DIRS].join(':'),
  };
}

function startTool(params: {
  path: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}): Result<StartedTool, string> {
  try {
    const child = spawn(params.path, params.args, {
      cwd: params.cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: params.env,
    });

    return {
      kind: 'succeeded',
      value: {
        process: child,
        stop: () => {
          killProcessGroup({ child: child });
        },
        release: () => {},
      },
    };
  } catch (error) {
    return { kind: 'failed', failure: formatThrownError(error) };
  }
}

/** Kills the tool and every process of its group; a group already gone is no error. */
function killProcessGroup(params: { child: ToolProcess }): void {
  if (params.child.pid === undefined) {
    return;
  }

  try {
    process.kill(-params.child.pid, 'SIGKILL');
  } catch (error) {
    if (!isGroupGoneError(error)) {
      throw error;
    }
  }
}

// macOS answers EPERM, not ESRCH, for a group whose last members are zombies not yet reaped.
function isGroupGoneError(error: unknown): boolean {
  const code = getErrorCode(error);

  return code === 'ESRCH' || code === 'EPERM';
}
