import { expect, test } from 'bun:test';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type {
  ExplorePathUnitLmStudioModel,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { loadLmStudioModelFindings } from '../../src/explore/lmStudioModels/loadLmStudioModelFindings.js';
import { recheckLmStudioModelUnit } from '../../src/explore/lmStudioModels/recheckLmStudioModelUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const DOWNLOADED_MS = NOW_MS - 10 * 24 * 60 * 60 * 1000;

const LM_STUDIO_COMMAND = '/Applications/LM Studio.app/Contents/MacOS/LM Studio';

type LmStudioFixture = { environment: Environment; modelsPath: string };

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withLmStudioHome(params: {
  run: (fixture: LmStudioFixture) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });

    await params.run({
      environment: environment,
      modelsPath: join(environment.homeDir, '.lmstudio', 'models'),
    });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

function buildRun(params: {
  environment: Environment;
  processCommands: string[] | null;
}): ExploreProbeRun {
  return {
    environment: params.environment,
    platform: buildTestProbePlatform(),
    processCommands: params.processCommands,
    deadlineMs: Date.now() + 10_000,
    unusedCutoffMs: 0,
    staleCutoffMs: 0,
  };
}

async function loadFindings(params: {
  environment: Environment;
  processCommands?: string[] | null;
}): Promise<ExploreProbeFindings> {
  const result = await loadLmStudioModelFindings(
    buildRun({
      environment: params.environment,
      processCommands: params.processCommands === undefined ? [] : params.processCommands,
    }),
  );

  if (result.kind === 'failed') {
    throw new Error(`The probe failed: ${result.failure.reason}.`);
  }

  return result.value;
}

/**
 * Two models of two publishers, a dot folder, a file and a link where a model belongs, and a
 * model in the older home `~/.cache/lm-studio`, which the probe does not read.
 */
async function createModels(fixture: LmStudioFixture): Promise<void> {
  const qwenPath = join(fixture.modelsPath, 'example-community', 'Qwen3-8B-GGUF');

  await writeFixtureTextFile({ path: join(qwenPath, 'Qwen3-8B-Q4_K_M.gguf'), text: 'weights' });
  await updateModifiedMs({ path: qwenPath, modifiedMs: DOWNLOADED_MS });
  await writeFixtureTextFile({
    path: join(fixture.modelsPath, 'someone', 'tiny-model', 'model.safetensors'),
    text: 'weights',
  });
  await writeFixtureTextFile({ path: join(fixture.modelsPath, '.staging', 'x', 'y'), text: '' });
  await writeFixtureTextFile({ path: join(fixture.modelsPath, 'someone', 'notes.txt'), text: '' });
  await symlink(qwenPath, join(fixture.modelsPath, 'someone', 'linked-model'));
  await writeFixtureTextFile({
    path: join(fixture.environment.homeDir, '.cache', 'lm-studio', 'models', 'old', 'm', 'a.gguf'),
    text: 'weights',
  });
}

function listUnits(findings: ExploreProbeFindings): ExplorePathUnitLmStudioModel[] {
  return findings.findings.flatMap((finding) =>
    finding.unit.kind === 'lmStudioModel' ? [finding.unit] : [],
  );
}

describeAwaitingWin32Platform('loadLmStudioModelFindings', () => {
  test('offers each publisher and model folder for review, with its time as the download', async () => {
    await withLmStudioHome({
      run: async (fixture) => {
        await createModels(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const qwen = listUnits(probed).find((unit) => unit.modelName === 'Qwen3-8B-GGUF');

        expect(probed.isComplete).toBe(true);
        expect(
          listUnits(probed)
            .map((unit): string => unit.folderPath)
            .toSorted(),
        ).toEqual([
          join(fixture.modelsPath, 'example-community', 'Qwen3-8B-GGUF'),
          join(fixture.modelsPath, 'someone', 'tiny-model'),
        ]);
        expect(qwen?.publisher).toBe('example-community');
        expect(qwen?.downloadedAtMs).toBe(DOWNLOADED_MS);
        expect(probed.findings.map((finding) => [finding.risk, finding.activity])).toEqual([
          ['review', 'idle'],
          ['review', 'idle'],
        ]);
      },
    });
  });

  test('marks each model busy while LM Studio runs, and unknown without processes', async () => {
    await withLmStudioHome({
      run: async (fixture) => {
        await createModels(fixture);

        const busy = await loadFindings({
          environment: fixture.environment,
          processCommands: [LM_STUDIO_COMMAND],
        });
        const unknown = await loadFindings({
          environment: fixture.environment,
          processCommands: null,
        });

        expect(busy.findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
        expect(unknown.findings.map((finding) => finding.activity)).toEqual(['unknown', 'unknown']);
      },
    });
  });

  test('finds nothing and is complete without the models folder', async () => {
    await withLmStudioHome({
      run: async (fixture) => {
        expect(await loadFindings({ environment: fixture.environment })).toEqual({
          findings: [],
          isComplete: true,
        });
      },
    });
  });
});

describeAwaitingWin32Platform('recheckLmStudioModelUnit', () => {
  test('is unchanged while the folder is there, busy while LM Studio runs, changed once gone', async () => {
    await withLmStudioHome({
      run: async (fixture) => {
        await createModels(fixture);

        const [unit] = listUnits(await loadFindings({ environment: fixture.environment }));

        if (unit === undefined) {
          throw new Error('No model was offered.');
        }

        const recheck = (processCommands: string[] | null) =>
          recheckLmStudioModelUnit({
            unit: unit,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: processCommands,
          });

        expect(await recheck([])).toEqual({ kind: 'unchanged' });
        expect(await recheck([LM_STUDIO_COMMAND])).toEqual({ kind: 'busy' });

        await rm(unit.folderPath, { recursive: true });

        expect(await recheck([])).toEqual({ kind: 'changed' });
      },
    });
  });
});
