import { runStoppingToolsOnProcessEnd } from '../../src/tools/runToolCommand.js';
import { hostPlatform } from '../support/platformFixtures.js';
import {
  parseFixtureArguments,
  runPidWritingTool,
  waitUntilPresent,
} from './runStoppingToolsOnProcessEndFixture.js';

/** The message of the rejection the fixture's run ends with while its tool still runs. */
export const RUN_REJECTION_MESSAGE = 'The run rejected while its tool still ran.';

async function rejectOnceToolStarted(params: { toolPidFile: string }): Promise<never> {
  await waitUntilPresent(params.toolPidFile);

  throw new Error(RUN_REJECTION_MESSAGE);
}

if (import.meta.main) {
  const fixtureArguments = parseFixtureArguments(process.argv.slice(2));

  await runStoppingToolsOnProcessEnd({
    processEndSignals: hostPlatform.tools.processEndSignals,
    run: () =>
      Promise.all([
        runPidWritingTool(fixtureArguments),
        rejectOnceToolStarted({ toolPidFile: fixtureArguments.toolPidFile }),
      ]),
  });
}
