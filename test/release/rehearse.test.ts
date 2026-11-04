import { afterEach, beforeEach, expect, setDefaultTimeout, test } from 'bun:test';
import { join } from 'node:path';
import type { FixtureCommandRun } from '../support/fixtureCommand.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { describeOnPosix } from '../support/posixOnly.js';
import type { FakeGhAnswer, FakeGhCall } from './releaseScriptFixtures.js';
import {
  createFakeGh,
  loadFakeGhCalls,
  loadReleaseWorkflowContract,
  REPO_VIEW_ARGUMENTS,
  runReleaseScript,
} from './releaseScriptFixtures.js';

// The fallback path sleeps one poll interval of the script, 5 seconds.
setDefaultTimeout(20_000);

const REPOSITORY = 'iOSonntag/magic-free-disk-space';
const PREVIOUS_RUN_ID = '111';
const NEW_RUN_ID = '222';

const RUN_LIST_ARGUMENTS = `run list --repo ${REPOSITORY} --workflow release.yml --event workflow_dispatch --branch main --limit 1 --json databaseId --jq .[0].databaseId // empty`;
const DISPATCH_ARGUMENTS = `workflow run release.yml --repo ${REPOSITORY} --ref main`;
const WATCH_ARGUMENTS = `run watch ${NEW_RUN_ID} --repo ${REPOSITORY} --exit-status`;
const RUN_STATE_ARGUMENTS = `run view ${NEW_RUN_ID} --repo ${REPOSITORY} --json status,conclusion --jq "\\(.status) \\(.conclusion)"`;
const DISPATCH_OUTPUT_WITH_URL = `✓ Created workflow_dispatch event for release.yml at main

https://github.com/${REPOSITORY}/actions/runs/${NEW_RUN_ID}
`;
const DISPATCH_OUTPUT_WITHOUT_URL = '✓ Created workflow_dispatch event for release.yml at main\n';

describeOnPosix('rehearse.sh', () => {
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
    /** What `gh run view` answers after a failed watch; `null` when the watch succeeds. */
    runStateText: string | null;
  }): Promise<void> {
    const answers: FakeGhAnswer[] = [
      { argumentsText: REPO_VIEW_ARGUMENTS, stdoutTexts: [`${REPOSITORY}\n`], exitCode: 0 },
      { argumentsText: RUN_LIST_ARGUMENTS, stdoutTexts: params.runListOutputTexts, exitCode: 0 },
      {
        argumentsText: params.dispatchArgumentsText,
        stdoutTexts: [params.dispatchOutputText],
        exitCode: 0,
      },
      {
        argumentsText: WATCH_ARGUMENTS,
        stdoutTexts: [''],
        exitCode: params.runStateText === null ? 0 : 1,
      },
      { argumentsText: buildDownloadArguments(), stdoutTexts: [''], exitCode: 0 },
    ];

    if (params.runStateText !== null) {
      answers.push({
        argumentsText: RUN_STATE_ARGUMENTS,
        stdoutTexts: [params.runStateText],
        exitCode: 0,
      });
    }

    await createFakeGh({ fixtureRoot: fixtureRoot, answers: answers });
  }

  async function runInterruptedWatch(runStateText: string): Promise<FixtureCommandRun> {
    await createRehearsalGh({
      dispatchArgumentsText: DISPATCH_ARGUMENTS,
      dispatchOutputText: DISPATCH_OUTPUT_WITH_URL,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      runStateText: runStateText,
    });

    return runRehearse([]);
  }

  async function hasDownloadCall(): Promise<boolean> {
    const callArguments = await loadCallArguments();

    return callArguments.some((argumentsText) => argumentsText.startsWith('run download '));
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
      dispatchArgumentsText: `${DISPATCH_ARGUMENTS} -f version=1.2.3`,
      dispatchOutputText: DISPATCH_OUTPUT_WITH_URL,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      runStateText: null,
    });

    const run = await runRehearse(['1.2.3']);

    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(DISPATCH_OUTPUT_WITH_URL);
    expect(run.stdoutText).toContain(buildDownloadDir());
    expect(await loadCallArguments()).toEqual([
      REPO_VIEW_ARGUMENTS,
      RUN_LIST_ARGUMENTS,
      `${DISPATCH_ARGUMENTS} -f version=1.2.3`,
      WATCH_ARGUMENTS,
      buildDownloadArguments(),
    ]);
  });

  test('polls the run list for a new run when the dispatch prints no URL', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: DISPATCH_ARGUMENTS,
      dispatchOutputText: DISPATCH_OUTPUT_WITHOUT_URL,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`, `${PREVIOUS_RUN_ID}\n`, `${NEW_RUN_ID}\n`],
      runStateText: null,
    });

    const run = await runRehearse([]);

    expect(run.exitCode).toBe(0);
    expect(await loadCallArguments()).toEqual([
      REPO_VIEW_ARGUMENTS,
      RUN_LIST_ARGUMENTS,
      DISPATCH_ARGUMENTS,
      RUN_LIST_ARGUMENTS,
      RUN_LIST_ARGUMENTS,
      WATCH_ARGUMENTS,
      buildDownloadArguments(),
    ]);
  });

  test('dispatches no input without a version, leaving the default to the workflow', async () => {
    await createRehearsalGh({
      dispatchArgumentsText: DISPATCH_ARGUMENTS,
      dispatchOutputText: DISPATCH_OUTPUT_WITH_URL,
      runListOutputTexts: [''],
      runStateText: null,
    });

    expect((await runRehearse([])).exitCode).toBe(0);

    const dispatchCalls = (await loadCallArguments()).filter((argumentsText) =>
      argumentsText.startsWith('workflow run '),
    );

    expect(dispatchCalls).toEqual([DISPATCH_ARGUMENTS]);
  });

  test('downloads the disk image when the watch fails but the run succeeded', async () => {
    const run = await runInterruptedWatch('completed success\n');

    expect(run.exitCode).toBe(0);
    expect(await loadCallArguments()).toEqual([
      REPO_VIEW_ARGUMENTS,
      RUN_LIST_ARGUMENTS,
      DISPATCH_ARGUMENTS,
      WATCH_ARGUMENTS,
      RUN_STATE_ARGUMENTS,
      buildDownloadArguments(),
    ]);
  });

  test('downloads nothing when the run fails', async () => {
    const run = await runInterruptedWatch('completed failure\n');

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain(
      `error: the rehearsal run ${NEW_RUN_ID} failed; its failed steps: gh run view ${NEW_RUN_ID} --repo ${REPOSITORY} --log-failed`,
    );
    expect(await loadCallArguments()).toContain(RUN_STATE_ARGUMENTS);
    expect(await hasDownloadCall()).toBe(false);
  });

  test('watches a run that is not completed again, three times at most', async () => {
    const run = await runInterruptedWatch('in_progress \n');

    expect(run.exitCode).toBe(1);
    expect(run.stdoutText).toContain(
      `The watch of run ${NEW_RUN_ID} stopped while the run is still in_progress; watching it again`,
    );
    expect(run.stderrText).toContain(
      `error: the run ${NEW_RUN_ID} is still in_progress after 3 watches; follow it under Actions > Release or with gh run watch ${NEW_RUN_ID} --repo ${REPOSITORY}`,
    );

    const watchCalls = (await loadCallArguments()).filter(
      (argumentsText) => argumentsText === WATCH_ARGUMENTS,
    );

    expect(watchCalls.length).toBe(3);
    expect(await hasDownloadCall()).toBe(false);
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
      dispatchArgumentsText: `${DISPATCH_ARGUMENTS} -f version=1.2.3`,
      dispatchOutputText: DISPATCH_OUTPUT_WITH_URL,
      runListOutputTexts: [`${PREVIOUS_RUN_ID}\n`],
      runStateText: null,
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
