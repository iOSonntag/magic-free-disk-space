import { join } from 'node:path';
import type { ToolCommandResult } from '../../src/tools/runToolCommand.js';
import { runStoppingToolsOnProcessEnd, runToolCommand } from '../../src/tools/runToolCommand.js';
import type { ProcessEndSignal } from '../../src/tools/toolsPlatform.js';
import { createFakeTool } from '../support/fakeTool.js';
import { isPresent } from '../support/fixtureRoot.js';
import { hostPlatform } from '../support/platformFixtures.js';

/** Codes no signal's default action gives, so an exit with one proves the listener ran. */
export const FIXTURE_SIGNAL_EXIT_CODES: Record<ProcessEndSignal, number> = {
  SIGHUP: 61,
  SIGINT: 62,
  SIGQUIT: 63,
  SIGTERM: 64,
};

/**
 * Runs a fake tool of the host that writes its pid to `toolPidFile` and then sleeps for a minute;
 * the run settles only once the tool is stopped.
 */
export async function runPidWritingTool(params: {
  rootDir: string;
  homeDir: string;
  tempDir: string;
  toolPidFile: string;
}): Promise<ToolCommandResult> {
  // The pid file is moved into place whole, so the test never reads half of it.
  const partialPidFile = `${params.toolPidFile}.partial`;
  const path = await createFakeTool({
    folder: join(params.rootDir, 'bin'),
    name: 'xcrun',
    body: `import { renameSync, writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(partialPidFile)}, String(process.pid));
renameSync(${JSON.stringify(partialPidFile)}, ${JSON.stringify(params.toolPidFile)});
await Bun.sleep(60_000);`,
  });

  return runToolCommand({
    tool: { name: 'xcrun', path: path },
    args: [],
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    timeoutMs: 60_000,
    processes: hostPlatform.tools.processes,
  });
}

export async function waitUntilPresent(path: string): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    if (await isPresent(path)) {
      return;
    }

    await Bun.sleep(20);
  }

  throw new Error(`${path} did not appear.`);
}

/** Parses the root, home, and temp folder and the pid file from the arguments of a fixture. */
export function parseFixtureArguments(argv: string[]): {
  rootDir: string;
  homeDir: string;
  tempDir: string;
  toolPidFile: string;
} {
  const [rootDir, homeDir, tempDir, toolPidFile] = argv;

  if (
    rootDir === undefined ||
    homeDir === undefined ||
    tempDir === undefined ||
    toolPidFile === undefined
  ) {
    throw new Error('The fixture takes the root, home, and temp folder and the pid file.');
  }

  return { rootDir: rootDir, homeDir: homeDir, tempDir: tempDir, toolPidFile: toolPidFile };
}

if (import.meta.main) {
  const fixtureArguments = parseFixtureArguments(process.argv.slice(2));

  await runStoppingToolsOnProcessEnd({
    processEndSignals: [
      { signal: 'SIGHUP', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGHUP },
      { signal: 'SIGINT', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGINT },
      { signal: 'SIGQUIT', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGQUIT },
      { signal: 'SIGTERM', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGTERM },
    ],
    run: () => runPidWritingTool(fixtureArguments),
  });
}
