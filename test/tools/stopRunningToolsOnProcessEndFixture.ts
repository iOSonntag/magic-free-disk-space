import { join } from 'node:path';
import type { ProcessEndSignal } from '../../src/tools/runToolCommand.js';
import { runToolCommand, stopRunningToolsOnProcessEnd } from '../../src/tools/runToolCommand.js';
import { createFakeTool } from '../support/fakeTool.js';

/** Codes no signal's default action gives, so an exit with one proves the listener ran. */
export const FIXTURE_SIGNAL_EXIT_CODES: Record<ProcessEndSignal, number> = {
  SIGHUP: 61,
  SIGINT: 62,
  SIGQUIT: 63,
  SIGTERM: 64,
};

async function runFixture(params: {
  rootDir: string;
  homeDir: string;
  tempDir: string;
  toolPidFile: string;
}): Promise<void> {
  stopRunningToolsOnProcessEnd({ signalExitCodes: FIXTURE_SIGNAL_EXIT_CODES });

  // The pid file is moved into place whole, so the test never reads half of it; the exec keeps
  // that pid the one process of the tool.
  const path = await createFakeTool({
    folder: join(params.rootDir, 'bin'),
    name: 'xcrun',
    body: `echo $$ > '${params.toolPidFile}.partial'
/bin/mv '${params.toolPidFile}.partial' '${params.toolPidFile}'
exec /bin/sleep 60`,
  });

  await runToolCommand({
    tool: { name: 'xcrun', path: path },
    args: [],
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    timeoutMs: 60_000,
  });
}

if (import.meta.main) {
  const [rootDir, homeDir, tempDir, toolPidFile] = process.argv.slice(2);

  if (
    rootDir === undefined ||
    homeDir === undefined ||
    tempDir === undefined ||
    toolPidFile === undefined
  ) {
    throw new Error('The fixture takes the root, home, and temp folder and the pid file.');
  }

  await runFixture({
    rootDir: rootDir,
    homeDir: homeDir,
    tempDir: tempDir,
    toolPidFile: toolPidFile,
  });
}
