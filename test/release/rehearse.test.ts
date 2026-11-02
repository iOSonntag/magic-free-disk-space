import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { join } from 'node:path';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import type { FakeGhAnswer, FakeGhCall, FixtureCommandRun } from './releaseScriptFixtures.js';
import {
  createFakeGh,
  loadFakeGhCalls,
  loadReleaseWorkflowContract,
  runReleaseScript,
} from './releaseScriptFixtures.js';

// The fallback path sleeps one poll interval of the script, 5 seconds.
setDefaultTimeout(20_000);

const REPOSITORY = 'iOSonntag/magic-free-disk-space';
const PREVIOUS_RUN_ID = '111';
const NEW_RUN_ID = '222';

const repoViewArguments = 'repo view --json nameWithOwner --jq .nameWithOwner';
const runListArguments = `run list --repo ${REPOSITORY} --workflow release.yml --event workflow_dispatch --branch main --limit 1 --json databaseId --jq .[0].databaseId // empty`;
const dispatchArguments = `workflow run release.yml --repo ${REPOSITORY} --ref main`;
const watchArguments = `run watch ${NEW_RUN_ID} --repo ${REPOSITORY} --exit-status`;
const dispatchOutputWithUrl = `✓ Created workflow_dispatch event for release.yml at main

https://github.com/${REPOSITORY}/actions/runs/${NEW_RUN_ID}
`;
const dispatchOutputWithoutUrl = '✓ Created workflow_dispatch event for release.yml at main\n';

describe('rehearse.sh', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildDownloadDir(): string {
    return join(fixtureRoot.homeDir, `Downloads/magic-free-disk-space-rehearsal-${NEW_RUN_ID}`);
  }

  function buildDownloadArguments(): string {
    return `run download ${NEW_RUN_ID} --repo ${REPOSITORY} --name dmg --dir ${buildDownloadDir()}`;
  }

  async function createRehearsalGh(params: {
    dispatchArgumentsText: string;
    dispatchOutputText: string;
    runListOutputTexts: [string, ...string[]];
    watchExitCode: number;
  }): Promise<void> {
    const answers: FakeGhAnswer[] = [
      { argumentsText: repoViewArguments, stdoutTexts: [`${REPOSITORY}\n`], exitCode: 0 },
      { argumentsText: runListArguments, stdoutTexts: params.runListOutputTexts, exitCode: 0 },
      {
        argumentsText: params.dispatchArgumentsText,
        stdoutTexts: [params.dispatchOutputText],
        exitCode: 0,
      },
      { argumentsText: watchArguments, stdoutTexts: [''], exitCode: params.watchExitCode },
      { argumentsText: buildDownloadArguments(), stdoutTexts: [''], exitCode: 0 },
    ];

    await createFakeGh({ fixtureRoot: fixtureRoot, answers: answers });
  }

  async function runRehearse(args: string[]): Promise<FixtureCommandRun> {
    return runReleaseScript({
      fixtureRoot: fixtureRoot,
      scriptName: 'rehearse.sh',
      args: args,
      workingDir: fixtureRoot.rootDir,
      stdinText: null,
    });
  }

  async function loadCallArguments(): Promise<string[]> {
    const calls = await loadFakeGhCalls({ fixtureRoot: fixtureRoot });

    return calls.map((call: FakeGhCall) => call.argumentsText);
  }

  test('takes the run id from the URL of the dispatch and downloads its disk image', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: `${dispatchArguments} -f version=1.2.3`,
      dispatchOutputText: dispatchOutputWithUrl,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      watchExitCode: 0,
    });

    const run = await runRehearse(['1.2.3']);

    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(dispatchOutputWithUrl);
    expect(run.stdoutText).toContain(buildDownloadDir());
    expect(await loadCallArguments()).toEqual([
      repoViewArguments,
      runListArguments,
      `${dispatchArguments} -f version=1.2.3`,
      watchArguments,
      buildDownloadArguments(),
    ]);
  });

  test('polls the run list for a new run when the dispatch prints no URL', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: dispatchArguments,
      dispatchOutputText: dispatchOutputWithoutUrl,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`, `${PREVIOUS_RUN_ID}\n`, `${NEW_RUN_ID}\n`],
      watchExitCode: 0,
    });

    const run = await runRehearse([]);

    expect(run.exitCode).toBe(0);
    expect(await loadCallArguments()).toEqual([
      repoViewArguments,
      runListArguments,
      dispatchArguments,
      runListArguments,
      runListArguments,
      watchArguments,
      buildDownloadArguments(),
    ]);
  });

  test('dispatches a given version as the input version', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: `${dispatchArguments} -f version=1.2.3`,
      dispatchOutputText: dispatchOutputWithUrl,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      watchExitCode: 0,
    });

    expect((await runRehearse(['1.2.3'])).exitCode).toBe(0);
    expect(await loadCallArguments()).toContain(`${dispatchArguments} -f version=1.2.3`);
  });

  test('dispatches no input without a version, leaving the default to the workflow', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: dispatchArguments,
      dispatchOutputText: dispatchOutputWithUrl,
      runListOutputTexts: [''],
      watchExitCode: 0,
    });

    expect((await runRehearse([])).exitCode).toBe(0);

    const dispatchCalls = (await loadCallArguments()).filter((argumentsText) =>
      argumentsText.startsWith('workflow run '),
    );

    expect(dispatchCalls).toEqual([dispatchArguments]);
  });

  test('downloads nothing when the run fails', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: dispatchArguments,
      dispatchOutputText: dispatchOutputWithUrl,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      watchExitCode: 1,
    });

    const run = await runRehearse([]);

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(
      `error: the rehearsal run ${NEW_RUN_ID} failed; its failed steps: gh run view ${NEW_RUN_ID} --repo ${REPOSITORY} --log-failed`,
    );

    const callArguments = await loadCallArguments();

    expect(callArguments).toContain(watchArguments);
    expect(callArguments.some((argumentsText) => argumentsText.startsWith('run download '))).toBe(
      false,
    );
  });

  test('refuses more than one argument', async () => {
    await createFakeGh({ fixtureRoot: fixtureRoot, answers: [] });

    const run = await runRehearse(['1.2.3', '1.2.4']);

    expect(run.exitCode).toBe(2);
    expect(run.stderrText).toStartWith('usage: ');
    expect(await loadCallArguments()).toEqual([]);
  });

  test('sends only the dispatch inputs and artifact names the workflow declares', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: `${dispatchArguments} -f version=1.2.3`,
      dispatchOutputText: dispatchOutputWithUrl,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      watchExitCode: 0,
    });

    expect((await runRehearse(['1.2.3'])).exitCode).toBe(0);

    const contract = await loadReleaseWorkflowContract();
    const callArguments = await loadCallArguments();
    const inputNames = callArguments.flatMap((argumentsText) =>
      [...argumentsText.matchAll(/ -f ([^= ]+)=/g)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1]],
      ),
    );
    const artifactNames = callArguments
      .filter((argumentsText) => argumentsText.startsWith('run download '))
      .flatMap((argumentsText) => {
        const name = / --name (\S+)/.exec(argumentsText)?.[1];

        return name === undefined ? [] : [name];
      });

    expect(inputNames.length).toBeGreaterThan(0);
    expect(artifactNames.length).toBeGreaterThan(0);

    for (const inputName of inputNames) {
      expect(contract.dispatchInputNames).toContain(inputName);
    }

    for (const artifactName of artifactNames) {
      expect(contract.uploadedArtifactNames).toContain(artifactName);
    }
  });
});
