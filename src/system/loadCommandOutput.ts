import type { Result } from '../result.js';

export type AllowedCommand = 'ps' | 'plutil' | 'xcode-select' | 'getconf';

export type CommandFailureTimedOut = {
  reason: 'timedOut';
  command: AllowedCommand;
  timeoutMs: number;
};

export type CommandFailureExitedWithError = {
  reason: 'exitedWithError';
  command: AllowedCommand;
  exitCode: number;
  stderrText: string;
};

export type CommandFailureSpawnFailed = {
  reason: 'spawnFailed';
  command: AllowedCommand;
  message: string;
};

export type CommandFailure =
  | CommandFailureTimedOut
  | CommandFailureExitedWithError
  | CommandFailureSpawnFailed;

type CommandProcess = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

type CommandCompletion = { stdoutText: string; stderrText: string; exitCode: number };

// Absolute paths, so a PATH entry planted by another tool never runs in place of the system binary.
const COMMAND_PATHS: Record<AllowedCommand, string> = {
  ps: '/bin/ps',
  plutil: '/usr/bin/plutil',
  'xcode-select': '/usr/bin/xcode-select',
  getconf: '/usr/bin/getconf',
};

/** Runs a command from the allow-list and returns its standard output; any other end is a failure. */
export async function loadCommandOutput(params: {
  command: AllowedCommand;
  args: string[];
  timeoutMs: number;
}): Promise<Result<string, CommandFailure>> {
  const started = startCommand({ command: params.command, args: params.args });

  if (started.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'spawnFailed', command: params.command, message: started.failure },
    };
  }

  const timer = createTimer({ timeoutMs: params.timeoutMs });
  const completion = await Promise.race([
    gatherCommandCompletion({ subprocess: started.value }),
    timer.expired,
  ]);

  timer.cancel();

  if (completion === null) {
    started.value.kill();

    return {
      kind: 'failed',
      failure: { reason: 'timedOut', command: params.command, timeoutMs: params.timeoutMs },
    };
  }

  if (completion.exitCode !== 0) {
    return {
      kind: 'failed',
      failure: {
        reason: 'exitedWithError',
        command: params.command,
        exitCode: completion.exitCode,
        stderrText: completion.stderrText,
      },
    };
  }

  return { kind: 'succeeded', value: completion.stdoutText };
}

function startCommand(params: {
  command: AllowedCommand;
  args: string[];
}): Result<CommandProcess, string> {
  try {
    const subprocess = Bun.spawn([COMMAND_PATHS[params.command], ...params.args], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return { kind: 'succeeded', value: subprocess };
  } catch (error) {
    return { kind: 'failed', failure: error instanceof Error ? error.message : String(error) };
  }
}

async function gatherCommandCompletion(params: {
  subprocess: CommandProcess;
}): Promise<CommandCompletion> {
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(params.subprocess.stdout).text(),
    new Response(params.subprocess.stderr).text(),
    params.subprocess.exited,
  ]);

  return { stdoutText: stdoutText, stderrText: stderrText, exitCode: exitCode };
}

/** `expired` resolves to `null` once the time is up, unless `cancel` ran first. */
function createTimer(params: { timeoutMs: number }): {
  expired: Promise<null>;
  cancel: () => void;
} {
  let handle: ReturnType<typeof setTimeout> | null = null;
  const expired = new Promise<null>((resolve) => {
    handle = setTimeout(() => {
      resolve(null);
    }, params.timeoutMs);
  });

  return {
    expired: expired,
    cancel: () => {
      if (handle !== null) {
        clearTimeout(handle);
      }
    },
  };
}
