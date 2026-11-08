import { join } from 'node:path';
import { runToolCommand, stopRunningToolsOnProcessEnd } from '../../src/tools/runToolCommand.js';
import type { ProcessEndSignal } from '../../src/tools/toolsPlatform.js';
import { createFakeTool } from '../support/fakeTool.js';
import { hostPlatform } from '../support/platformFixtures.js';

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
  stopRunningToolsOnProcessEnd({
    processEndSignals: [
      { signal: 'SIGHUP', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGHUP },
      { signal: 'SIGINT', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGINT },
      { signal: 'SIGQUIT', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGQUIT },
      { signal: 'SIGTERM', exitCode: FIXTURE_SIGNAL_EXIT_CODES.SIGTERM },
    ],
  });

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

  await runToolCommand({
    tool: { name: 'xcrun', path: path },
    args: [],
    homeDir: params.homeDir,
    tempDir: params.tempDir,
    timeoutMs: 60_000,
    processes: hostPlatform.tools.processes,
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
