/** What a command a test ran exited with, and all it printed. */
export type FixtureCommandRun = { exitCode: number; stdoutText: string; stderrText: string };

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
