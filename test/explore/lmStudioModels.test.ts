import { describe, expect, test } from 'bun:test';
import { rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import type { ExplorePathUnitLmStudioModel } from '../../src/explore/exploreUnit.js';
import { compareLmStudioModelUnit } from '../../src/explore/lmStudioModels/compareLmStudioModelUnit.js';
import { loadLmStudioModelFindings } from '../../src/explore/lmStudioModels/loadLmStudioModelFindings.js';
import type { LmStudioModelFolder } from '../../src/explore/lmStudioModels/loadLmStudioModelState.js';
import { recheckLmStudioModelUnit } from '../../src/explore/lmStudioModels/recheckLmStudioModelUnit.js';
import { DAY_MS } from '../../src/scan/limits.js';
import { updateModifiedMs, writeFixtureTextFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { describeOnPosix, testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  getUnitOfKind,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const DOWNLOADED_MS = NOW_MS - 10 * DAY_MS;

const LM_STUDIO_COMMAND = '/Applications/LM Studio.app/Contents/MacOS/LM Studio';

const VALUE_UNIT: ExplorePathUnitLmStudioModel = {
  kind: 'lmStudioModel',
  publisher: 'example-community',
  modelName: 'Qwen3-8B-GGUF',
  folderPath: buildTestAbsolutePath({
    text: '/Users/example/.lmstudio/models/example-community/Qwen3-8B-GGUF',
  }),
  downloadedAtMs: DOWNLOADED_MS,
};

const VALUE_FOLDER: LmStudioModelFolder = {
  publisher: VALUE_UNIT.publisher,
  modelName: VALUE_UNIT.modelName,
  path: VALUE_UNIT.folderPath,
  modifiedMs: DOWNLOADED_MS,
};

function buildModelsPath(home: FixtureHome): string {
  return join(home.environment.homeDir, '.lmstudio', 'models');
}

/**
 * Two models of two publishers, a dot folder, a file and a link where a model belongs, and a
 * model in the older home `~/.cache/lm-studio`, which the probe does not read.
 */
async function createModels(home: FixtureHome): Promise<void> {
  const modelsPath = buildModelsPath(home);
  const qwenPath = join(modelsPath, 'example-community', 'Qwen3-8B-GGUF');

  await writeFixtureTextFile({ path: join(qwenPath, 'Qwen3-8B-Q4_K_M.gguf'), text: 'weights' });
  await updateModifiedMs({ path: qwenPath, modifiedMs: DOWNLOADED_MS });
  await writeFixtureTextFile({
    path: join(modelsPath, 'someone', 'tiny-model', 'model.safetensors'),
    text: 'weights',
  });
  await writeFixtureTextFile({ path: join(modelsPath, '.staging', 'x', 'y'), text: '' });
  await writeFixtureTextFile({ path: join(modelsPath, 'someone', 'notes.txt'), text: '' });
  await symlink(qwenPath, join(modelsPath, 'someone', 'linked-model'));
  await writeFixtureTextFile({
    path: join(home.environment.homeDir, '.cache', 'lm-studio', 'models', 'old', 'm', 'a.gguf'),
    text: 'weights',
  });
}

describe('compareLmStudioModelUnit', () => {
  test('is unchanged while its folder is still a model folder and LM Studio idle', () => {
    expect(
      compareLmStudioModelUnit({
        unit: VALUE_UNIT,
        folders: [VALUE_FOLDER],
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once its folder is no model folder', () => {
    expect(
      compareLmStudioModelUnit({
        unit: VALUE_UNIT,
        folders: [
          {
            ...VALUE_FOLDER,
            path: buildTestAbsolutePath({
              text: '/Users/example/.lmstudio/models/example-community/Qwen3-4B-GGUF',
            }),
          },
        ],
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed once its folder changed after the scan', () => {
    expect(
      compareLmStudioModelUnit({
        unit: VALUE_UNIT,
        folders: [{ ...VALUE_FOLDER, modifiedMs: DOWNLOADED_MS + 1_000 }],
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while LM Studio runs, or the processes are unknown', () => {
    for (const runningProcesses of [buildRunningCommandLines([LM_STUDIO_COMMAND]), null]) {
      expect(
        compareLmStudioModelUnit({
          unit: VALUE_UNIT,
          folders: [VALUE_FOLDER],
          runningProcesses: runningProcesses,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

// A test that writes the models runs on POSIX only, as they hold a symbolic link.
describe('loadLmStudioModelFindings', () => {
  testOnPosix(
    'offers each publisher and model folder for review, with its time as the download',
    async () => {
      await withFixtureHome({
        nowMs: NOW_MS,
        run: async (home) => {
          await createModels(home);
          const modelsPath = buildModelsPath(home);

          const probed = getProbeFindings(
            await loadLmStudioModelFindings(buildTestProbeRun({ environment: home.environment })),
          );
          const units = listUnitsOfKind({ findings: probed, kind: 'lmStudioModel' });
          const qwen = units.find((unit) => unit.modelName === 'Qwen3-8B-GGUF');

          expect(probed.isComplete).toBe(true);
          expect(units.map((unit): string => unit.folderPath).toSorted()).toEqual([
            join(modelsPath, 'example-community', 'Qwen3-8B-GGUF'),
            join(modelsPath, 'someone', 'tiny-model'),
          ]);
          expect(qwen?.publisher).toBe('example-community');
          expect(qwen?.downloadedAtMs).toBe(DOWNLOADED_MS);
          expect(probed.findings.map((finding) => [finding.risk, finding.activity])).toEqual([
            ['review', 'idle'],
            ['review', 'idle'],
          ]);

          const busy = getProbeFindings(
            await loadLmStudioModelFindings(
              buildTestProbeRun({
                environment: home.environment,
                runningProcesses: buildRunningCommandLines([LM_STUDIO_COMMAND]),
              }),
            ),
          );

          expect(busy.findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
        },
      });
    },
  );

  test('finds nothing and is complete without the models folder', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        expect(
          await loadLmStudioModelFindings(buildTestProbeRun({ environment: home.environment })),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: true } });
      },
    });
  });
});

// The models it writes hold a symbolic link.
describeOnPosix('recheckLmStudioModelUnit', () => {
  test('is unchanged while the folder is there, changed once gone', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        await createModels(home);

        const unit = getUnitOfKind({
          findings: getProbeFindings(
            await loadLmStudioModelFindings(buildTestProbeRun({ environment: home.environment })),
          ),
          kind: 'lmStudioModel',
        });
        function recheck(): Promise<PathUnitRecheck> {
          return recheckLmStudioModelUnit({
            unit: unit,
            environment: home.environment,
            platform: buildTestProbePlatform(),
            runningProcesses: buildRunningCommandLines([]),
          });
        }

        expect(await recheck()).toEqual({ kind: 'unchanged' });

        await rm(unit.folderPath, { recursive: true });

        expect(await recheck()).toEqual({ kind: 'changed' });
      },
    });
  });

  test('is changed once a file came into the folder after the scan', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        await createModels(home);

        const units = listUnitsOfKind({
          findings: getProbeFindings(
            await loadLmStudioModelFindings(buildTestProbeRun({ environment: home.environment })),
          ),
          kind: 'lmStudioModel',
        });
        const qwen = units.find((unit) => unit.modelName === 'Qwen3-8B-GGUF');

        if (qwen === undefined) {
          throw new Error('The Qwen model should be offered.');
        }

        await writeFixtureTextFile({
          path: join(qwen.folderPath, 'Qwen3-8B-Q8_0.gguf'),
          text: 'more weights',
        });

        expect(
          await recheckLmStudioModelUnit({
            unit: qwen,
            environment: home.environment,
            platform: buildTestProbePlatform(),
            runningProcesses: buildRunningCommandLines([]),
          }),
        ).toEqual({ kind: 'changed' });
      },
    });
  });
});
