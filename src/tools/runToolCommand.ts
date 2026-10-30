import type { ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Result } from '../result.js';
import { buildToolProcessEnvironment } from './buildToolProcessEnvironment.js';
import type { LocatedTool } from './findTrustedTool.js';
import type { ToolName } from './toolInstallLocations.js';

/** The tool's group is killed once its standard output passes this size. */
export const TOOL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const STDERR_TAIL_MAX_BYTES = 4 * 1024;

// Arguments that keep each tool from reporting home or prompting.
const TOOL_LEADING_ARGUMENTS: Record<ToolName, string[]> = {
  xcrun: [],
  dart: ['--suppress-analytics'],
  mise: [],
};

/** The output of a run that exited with 0. */
export type ToolCommandOutput = { stdoutText: string; stderrTail: string };

export type ToolCommandFailureExitedWithError = {
  reason: 'exitedWithError';
  exitCode: number;
  stderrTail: string;
};

export type ToolCommandFailureEndedBySignal = {
  reason: 'endedBySignal';
  signal: string;
  stderrTail: string;
};

/** The tool and every process it started were killed at the limit. */
export type ToolCommandFailureTimedOut = {
  reason: 'timedOut';
  timeoutMs: number;
  stderrTail: string;
};

export type ToolCommandFailureSpawnFailed = { reason: 'spawnFailed'; message: string };

/** The tool and every process it started were killed once stdout passed the limit. */
export type ToolCommandFailureOutputTooLarge = {
  reason: 'outputTooLarge';
  maxOutputBytes: number;
  stderrTail: string;
};

export type ToolCommandFailure =
  | ToolCommandFailureExitedWithError
  | ToolCommandFailureEndedBySignal
  | ToolCommandFailureTimedOut
  | ToolCommandFailureSpawnFailed
  | ToolCommandFailureOutputTooLarge;

type ToolCommandResult = Result<ToolCommandOutput, ToolCommandFailure>;

type ToolProcess = ChildProcessByStdio<null, Readable, Readable>;

/**
 * Runs the tool in a process group of its own, with the environment `buildToolProcessEnvironment`
 * builds and the tool's fixed leading arguments before `args`. Only exit 0 succeeds.
 */
export async function runToolCommand(params: {
  tool: LocatedTool;
  args: string[];
  homeDir: string;
  tempDir: string;
  timeoutMs: number;
}): Promise<ToolCommandResult> {
  const started = startToolProcess({
    tool: params.tool,
    args: [...TOOL_LEADING_ARGUMENTS[params.tool.name], ...params.args],
    homeDir: params.homeDir,
    tempDir: params.tempDir,
  });

  if (started.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'spawnFailed', message: started.failure } };
  }

  return gatherToolCompletion({ child: started.value, timeoutMs: params.timeoutMs });
}

function startToolProcess(params: {
  tool: LocatedTool;
  args: string[];
  homeDir: string;
  tempDir: string;
}): Result<ToolProcess, string> {
  const environment = buildToolProcessEnvironment({
    tool: params.tool,
    homeDir: params.homeDir,
    tempDir: params.tempDir,
  });

  try {
    const child = spawn(params.tool.path, params.args, {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: environment,
    });

    return { kind: 'succeeded', value: child };
  } catch (error) {
    return { kind: 'failed', failure: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Settles once: at the limit, at the output cap, at a spawn error, or once the tool exited and
 * its streams closed. Every end but a spawn error kills what is left of the tool's group.
 */
function gatherToolCompletion(params: {
  child: ToolProcess;
  timeoutMs: number;
}): Promise<ToolCommandResult> {
  return new Promise((resolve) => {
    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrTail: Buffer = Buffer.alloc(0);
    let settled = false;

    function settle(result: ToolCommandResult): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    const timer = setTimeout(() => {
      killProcessGroup({ child: params.child });
      settle({
        kind: 'failed',
        failure: {
          reason: 'timedOut',
          timeoutMs: params.timeoutMs,
          stderrTail: stderrTail.toString('utf8'),
        },
      });
    }, params.timeoutMs);

    params.child.stdout.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }

      stdoutBytes += chunk.length;

      if (stdoutBytes > TOOL_MAX_OUTPUT_BYTES) {
        killProcessGroup({ child: params.child });
        settle({
          kind: 'failed',
          failure: {
            reason: 'outputTooLarge',
            maxOutputBytes: TOOL_MAX_OUTPUT_BYTES,
            stderrTail: stderrTail.toString('utf8'),
          },
        });

        return;
      }

      stdoutChunks.push(chunk);
    });

    params.child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = keepStderrTail(Buffer.concat([stderrTail, chunk]));
    });

    params.child.on('error', (error) => {
      settle({ kind: 'failed', failure: { reason: 'spawnFailed', message: error.message } });
    });

    // A process the tool left behind would hold the streams open; killing its group lets them close.
    params.child.on('exit', () => {
      killProcessGroup({ child: params.child });
    });

    params.child.on('close', (exitCode, signal) => {
      settle(
        toolEndToResult({
          exitCode: exitCode,
          signal: signal,
          stdoutText: Buffer.concat(stdoutChunks).toString('utf8'),
          stderrTail: stderrTail.toString('utf8'),
        }),
      );
    });
  });
}

function toolEndToResult(params: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutText: string;
  stderrTail: string;
}): ToolCommandResult {
  if (params.signal !== null) {
    return {
      kind: 'failed',
      failure: { reason: 'endedBySignal', signal: params.signal, stderrTail: params.stderrTail },
    };
  }

  if (params.exitCode !== 0) {
    return {
      kind: 'failed',
      failure: {
        reason: 'exitedWithError',
        // Node reports no code only together with a signal, which the branch above took.
        exitCode: params.exitCode ?? -1,
        stderrTail: params.stderrTail,
      },
    };
  }

  return {
    kind: 'succeeded',
    value: { stdoutText: params.stdoutText, stderrTail: params.stderrTail },
  };
}

function keepStderrTail(stderr: Buffer): Buffer {
  if (stderr.length <= STDERR_TAIL_MAX_BYTES) {
    return stderr;
  }

  return stderr.subarray(stderr.length - STDERR_TAIL_MAX_BYTES);
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
  return (
    error instanceof Error && 'code' in error && (error.code === 'ESRCH' || error.code === 'EPERM')
  );
}
