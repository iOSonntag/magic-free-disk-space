import { EXIT_CODES } from './cli/exitCodes.js';
import { runCli } from './cli/runCli.js';
import type { TerminalIo } from './cli/terminalIo.js';
import { createTerminalIo } from './cli/terminalIo.js';
import { darwinPlatform } from './platform/darwin/darwinPlatform.js';
import type { Platform } from './platform/platform.js';
import { parsePlatformId } from './platform/platform.js';
import {
  formatEnvironmentFailure,
  formatUnsupportedPlatform,
} from './report/formatEnvironmentFailure.js';
import { stopRunningToolsOnProcessEnd } from './tools/runToolCommand.js';

async function main(): Promise<number> {
  const io = createTerminalIo();
  const platformId = parsePlatformId({ text: process.platform });

  if (platformId.kind === 'failed') {
    return refuseUnsupportedPlatform({ io: io });
  }

  switch (platformId.value) {
    case 'darwin':
      return runCliOnPlatform({ io: io, platform: darwinPlatform });
    case 'win32':
      return refuseUnsupportedPlatform({ io: io });
  }
}

/** Runs the CLI with the platform's slices, its tools stopped on every end of the process. */
async function runCliOnPlatform(params: { io: TerminalIo; platform: Platform }): Promise<number> {
  stopRunningToolsOnProcessEnd({ processEndSignals: params.platform.tools.processEndSignals });

  const environmentResult = await params.platform.environment.loadEnvironment();

  if (environmentResult.kind === 'failed') {
    params.io.writeError(`${formatEnvironmentFailure({ failure: environmentResult.failure })}\n`);

    return EXIT_CODES.cannotStart;
  }

  return runCli({
    argv: process.argv.slice(2),
    environment: environmentResult.value,
    catalog: params.platform.catalog,
    tools: params.platform.tools,
    scan: params.platform.scan,
    system: params.platform.system,
    delete: params.platform.delete,
    explore: params.platform.explore,
    texts: params.platform.report,
    io: params.io,
  });
}

function refuseUnsupportedPlatform(params: { io: TerminalIo }): number {
  params.io.writeError(`${formatUnsupportedPlatform()}\n`);

  return EXIT_CODES.cannotStart;
}

process.exitCode = await main();
