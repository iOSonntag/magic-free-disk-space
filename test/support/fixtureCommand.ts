/** What a command a test ran exited with, and all it printed. */
export type FixtureCommandRun = { exitCode: number; stdoutText: string; stderrText: string };

/** What a child process exited with, whether it was killed at its time limit, and all it printed. */
export type ChildProcessRun = {
  exitCode: number | null;
  timedOut: boolean;
  stdout: Uint8Array;
  stderr: string;
};

/**
 * `baseEnvironment` with the git variables of a fixture: git reads the global config at
 * `globalConfigPath` and no system config, so no hook, signing, or credential helper of the
 * machine runs; it prompts for nothing, and commits under one fixed identity.
 */
export function buildFixtureGitEnvironment(params: {
  baseEnvironment: Record<string, string>;
  globalConfigPath: string;
}): Record<string, string> {
  return {
    ...params.baseEnvironment,
    GIT_CONFIG_GLOBAL: params.globalConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Fixture Test',
    GIT_AUTHOR_EMAIL: 'fixture-test@example.com',
    GIT_COMMITTER_NAME: 'Fixture Test',
    GIT_COMMITTER_EMAIL: 'fixture-test@example.com',
  };
}

/**
 * Runs `command` in `workingDir` with exactly `environment`, feeds it `stdinText`, or no stdin for
 * `null`, and returns its exit code and all it printed once it exited.
 */
export async function spawnFixtureCommand(params: {
  command: string[];
  workingDir: string;
  environment: Record<string, string>;
  stdinText: string | null;
}): Promise<FixtureCommandRun> {
  const child = Bun.spawn(params.command, {
    cwd: params.workingDir,
    env: params.environment,
    stdin: params.stdinText === null ? 'ignore' : new Blob([params.stdinText]),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdoutText, stderrText, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return { exitCode: exitCode, stdoutText: stdoutText, stderrText: stderrText };
}

/**
 * Runs `command`, writes `stdin` to it and closes its input, or gives it no input for `null`, and
 * kills it once it runs past `timeoutMs`; resolves once it exited, never rejects for its exit.
 */
export async function runChildProcess(params: {
  command: string[];
  stdin: Uint8Array | null;
  timeoutMs: number;
}): Promise<ChildProcessRun> {
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
}
