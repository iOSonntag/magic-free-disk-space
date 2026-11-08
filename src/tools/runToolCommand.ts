import { dirname } from 'node:path';
import type { Result } from '../result.js';
import { buildToolProcessEnvironment } from './buildToolProcessEnvironment.js';
import type { LocatedTool } from './findTrustedTool.js';
import type { ToolName } from './toolInstallLocations.js';
import type { ProcessEndSignalExit, StartedTool, ToolProcessPlatform } from './toolsPlatform.js';

/** The tool and every process it started are stopped once its standard output passes this size. */
export const TOOL_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

const STDERR_TAIL_MAX_BYTES = 4 * 1024;

// Arguments that keep each tool from reporting home or prompting.
const TOOL_LEADING_ARGUMENTS: Record<ToolName, string[]> = {
  xcrun: [],
  dart: ['--suppress-analytics'],
  mise: [],
  brewAppleSilicon: [],
  brewIntel: [],
  avdmanager: [],
  asdf: [],
  brctl: [],
  vagrant: [],
  rustup: [],
  conda: [],
  fvm: [],
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

export type ToolCommandResult = Result<ToolCommandOutput, ToolCommandFailure>;

/** Each tool whose run has not settled yet, so `stopRunningTools` can reach its processes. */
const runningTools = new Set<StartedTool>();

/**
 * Runs the tool as `processes` starts it, so its end reaches every process it started, in
 * `tempDir` (so no tool reads config from the folder the app started in), with the base
 * environment `processes` builds and the tool's own entries, and the arguments
 * `buildToolArguments` builds. Only exit 0 succeeds.
 */
export async function runToolCommand(params: {
  tool: LocatedTool;
  args: string[];
  homeDir: string;
  tempDir: string;
  timeoutMs: number;
  processes: ToolProcessPlatform;
}): Promise<ToolCommandResult> {
  const baseEnvironment = params.processes.buildBaseEnvironment({
    toolFolderPath: dirname(params.tool.path),
    homeDir: params.homeDir,
    tempDir: params.tempDir,
  });
  const started = params.processes.startTool({
    path: params.tool.path,
    args: buildToolArguments({ name: params.tool.name, args: params.args }),
    cwd: params.tempDir,
    env: buildToolProcessEnvironment({
      tool: params.tool,
      baseEnvironment: baseEnvironment,
    }),
  });

  if (started.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'spawnFailed', message: started.failure } };
  }

  runningTools.add(started.value);

  const result = await gatherToolCompletion({ tool: started.value, timeoutMs: params.timeoutMs });

  runningTools.delete(started.value);
  started.value.release();

  return result;
}

/** The whole argument list of a run: the tool's fixed leading arguments, then `args`. */
export function buildToolArguments(params: { name: ToolName; args: string[] }): string[] {
  return [...TOOL_LEADING_ARGUMENTS[params.name], ...params.args];
}

/**
 * Ends every tool whose run has not settled, with every process it started, which no signal to
 * the app reaches; ones already gone are no error. Each of those runs then settles.
 */
export function stopRunningTools(): void {
  for (const tool of runningTools) {
    tool.stop();
  }
}

/**
 * Runs `run` while every running tool is stopped when the process exits, and on each signal the
 * process exits with its code: a tool's processes may outlive the app unless they are stopped
 * here. Once the run settled, resolved or rejected, it stops every tool still running and removes
 * these listeners, since a listener of a signal may keep the process running on Windows.
 */
export async function runStoppingToolsOnProcessEnd<TResult>(params: {
  processEndSignals: ProcessEndSignalExit[];
  run: () => Promise<TResult>;
}): Promise<TResult> {
  const signalListeners = params.processEndSignals.map((processEnd) => {
    function onSignal(): void {
      stopRunningTools();
      process.exit(processEnd.exitCode);
    }

    process.on(processEnd.signal, onSignal);

    return { signal: processEnd.signal, listener: onSignal };
  });

  process.on('exit', stopRunningTools);

  try {
    return await params.run();
  } finally {
    stopRunningTools();
    process.off('exit', stopRunningTools);

    for (const signalListener of signalListeners) {
      process.off(signalListener.signal, signalListener.listener);
    }
  }
}

/**
 * Settles once: at the limit, at the output cap, at a spawn error, or once the tool exited and
 * its streams closed. Every end stops what is left of the tool's processes before it settles.
 */
function gatherToolCompletion(params: {
  tool: StartedTool;
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
      params.tool.stop();
      settle({
        kind: 'failed',
        failure: {
          reason: 'timedOut',
          timeoutMs: params.timeoutMs,
          stderrTail: stderrTail.toString('utf8'),
        },
      });
    }, params.timeoutMs);

    params.tool.process.stdout.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }

      stdoutBytes += chunk.length;

      if (stdoutBytes > TOOL_MAX_OUTPUT_BYTES) {
        params.tool.stop();
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

    params.tool.process.stderr.on('data', (chunk: Buffer) => {
      stderrTail = keepStderrTail(Buffer.concat([stderrTail, chunk]));
    });

    // A spawn error leaves no process; an error of a started tool may leave some.
    params.tool.process.on('error', (error) => {
      params.tool.stop();
      settle({ kind: 'failed', failure: { reason: 'spawnFailed', message: error.message } });
    });

    // A process the tool left behind would hold the streams open; stopping it lets them close.
    params.tool.process.on('exit', () => {
      params.tool.stop();
    });

    params.tool.process.on('close', (exitCode, signal) => {
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
