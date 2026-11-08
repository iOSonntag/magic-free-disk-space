import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import type {
  ExplorePathUnitOllamaModel,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import {
  buildOllamaModelFindings,
  formatOllamaModelName,
} from '../../src/explore/ollamaModels/buildOllamaModelFindings.js';
import { compareOllamaModelUnit } from '../../src/explore/ollamaModels/compareOllamaModelUnit.js';
import { decideOllamaModelOffers } from '../../src/explore/ollamaModels/decideOllamaModelOffers.js';
import { loadOllamaModelFindings } from '../../src/explore/ollamaModels/loadOllamaModelFindings.js';
import type {
  OllamaManifest,
  OllamaModelStateInstalled,
} from '../../src/explore/ollamaModels/loadOllamaModelState.js';
import { parseOllamaModelName } from '../../src/explore/ollamaModels/parseOllamaModelName.js';
import { recheckOllamaModelUnit } from '../../src/explore/ollamaModels/recheckOllamaModelUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { DAY_MS } from '../../src/scan/limits.js';
import type { RunningProcesses } from '../../src/system/systemPlatform.js';
import {
  createFixtureFile,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import type { HomeFolder } from '../support/parsedValueFixtures.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const BLOB_MODIFIED_MS = NOW_MS - 3 * DAY_MS;

const MANIFEST_MODIFIED_MS = NOW_MS - 2 * DAY_MS;

const LIBRARY_PATH_NAMES = ['manifests', 'registry.ollama.ai', 'library'];

const MODEL = 'llama3';

/** Fake digests; each names one blob file of the fixture. */
const DIGESTS = {
  latestConfig: 'a'.repeat(64),
  latestWeights: 'b'.repeat(64),
  smallConfig: 'c'.repeat(64),
  shared: 'd'.repeat(64),
  extra: 'e'.repeat(64),
};

const VALUE_MODELS_PATH = '/models';

/**
 * The findings of the probe. No process runs unless `runningProcesses` names one, listed by command
 * line on every host, since only macOS explores Ollama models.
 */
async function loadFindings(params: {
  environment: Environment;
  runningProcesses?: RunningProcesses;
}): Promise<ExploreProbeFindings> {
  const probeRun = buildTestProbeRun({
    environment: params.environment,
    runningProcesses: params.runningProcesses ?? buildRunningCommandLines([]),
  });

  return getProbeFindings(await loadOllamaModelFindings(probeRun));
}

function buildModelsPath(params: { home: HomeFolder }): string {
  return join(params.home.homeDir, '.ollama', 'models');
}

function buildBlobPath(params: { home: HomeFolder; hex: string }): string {
  return join(buildModelsPath(params), 'blobs', `sha256-${params.hex}`);
}

/** The manifest of a tag of the model `llama3` in Ollama's own library. */
function buildManifestPath(params: { home: HomeFolder; tag: string }): string {
  return join(buildModelsPath(params), ...LIBRARY_PATH_NAMES, MODEL, params.tag);
}

function buildManifestText(params: { configHex: string; layerHexes: string[] }): string {
  return JSON.stringify({
    schemaVersion: 2,
    mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    config: { digest: `sha256:${params.configHex}`, size: 1 },
    layers: params.layerHexes.map((hex) => ({ digest: `sha256:${hex}`, size: 1 })),
  });
}

/** Writes the manifest of a tag, written at `MANIFEST_MODIFIED_MS`. */
async function writeManifest(params: {
  home: HomeFolder;
  tag: string;
  configHex: string;
  layerHexes: string[];
}): Promise<void> {
  const path = buildManifestPath(params);

  await writeFixtureTextFile({ path: path, text: buildManifestText(params) });
  await updateModifiedMs({ path: path, modifiedMs: MANIFEST_MODIFIED_MS });
}

async function writeBlobs(params: { home: HomeFolder; hexes: string[] }): Promise<void> {
  for (const hex of params.hexes) {
    await createFixtureFile({
      path: buildBlobPath({ home: params.home, hex: hex }),
      sizeBytes: 4096,
      modifiedMs: BLOB_MODIFIED_MS,
    });
  }
}

/** Two tags of one model that share a layer: `latest` and `small`. */
async function createTwoModels(params: { home: HomeFolder }): Promise<void> {
  await writeBlobs({
    home: params.home,
    hexes: [DIGESTS.latestConfig, DIGESTS.latestWeights, DIGESTS.smallConfig, DIGESTS.shared],
  });
  await writeManifest({
    home: params.home,
    tag: 'latest',
    configHex: DIGESTS.latestConfig,
    layerHexes: [DIGESTS.latestWeights, DIGESTS.shared],
  });
  await writeManifest({
    home: params.home,
    tag: 'small',
    configHex: DIGESTS.smallConfig,
    layerHexes: [DIGESTS.shared],
  });
}

/** The unit of the model whose manifest lies at `manifestPath`; throws when it was not offered. */
function getModelUnit(params: {
  findings: ExploreProbeFindings;
  manifestPath: string;
}): ExplorePathUnitOllamaModel {
  const unit = listUnitsOfKind({ findings: params.findings, kind: 'ollamaModel' }).find(
    (candidate) => candidate.manifestPath === params.manifestPath,
  );

  if (unit === undefined) {
    throw new Error('The model was not offered.');
  }

  return unit;
}

function recheck(params: {
  unit: ExplorePathUnitOllamaModel;
  environment: Environment;
  commandLines: string[] | null;
}): Promise<PathUnitRecheck> {
  return recheckOllamaModelUnit({
    unit: params.unit,
    environment: params.environment,
    platform: buildTestProbePlatform(),
    runningProcesses: buildRunningCommandLines(params.commandLines),
  });
}

function buildValueBlobPath(hex: string): AbsolutePath {
  return buildTestAbsolutePath({ text: `${VALUE_MODELS_PATH}/blobs/sha256-${hex}` });
}

function buildValueManifest(params: { tag: string; hexes: string[] | null }): OllamaManifest {
  return {
    name: { host: 'registry.ollama.ai', namespace: 'library', model: MODEL, tag: params.tag },
    path: buildTestAbsolutePath({
      text: `${VALUE_MODELS_PATH}/${LIBRARY_PATH_NAMES.join('/')}/${MODEL}/${params.tag}`,
    }),
    modifiedMs: MANIFEST_MODIFIED_MS,
    digests: params.hexes === null ? null : params.hexes.map((hex) => `sha256:${hex}`),
  };
}

function buildValueState(params: {
  manifests: OllamaManifest[];
  blobHexes: string[];
  isEveryEntryKnown?: boolean;
}): OllamaModelStateInstalled {
  return {
    kind: 'installed',
    manifests: params.manifests,
    isEveryEntryKnown: params.isEveryEntryKnown ?? true,
    blobPaths: new Map(params.blobHexes.map((hex) => [`sha256:${hex}`, buildValueBlobPath(hex)])),
  };
}

describe('decideOllamaModelOffers', () => {
  test('offers each model with the blobs present that no other manifest names', () => {
    const latest = buildValueManifest({
      tag: 'latest',
      hexes: [DIGESTS.latestConfig, DIGESTS.latestWeights, DIGESTS.shared, DIGESTS.extra],
    });
    const small = buildValueManifest({
      tag: 'small',
      hexes: [DIGESTS.smallConfig, DIGESTS.shared],
    });
    const offers = decideOllamaModelOffers({
      state: buildValueState({
        manifests: [latest, small],
        blobHexes: [
          DIGESTS.latestConfig,
          DIGESTS.latestWeights,
          DIGESTS.smallConfig,
          DIGESTS.shared,
        ],
      }),
    });

    expect(offers).toEqual([
      {
        manifest: latest,
        digestCount: 4,
        blobPaths: [
          buildValueBlobPath(DIGESTS.latestConfig),
          buildValueBlobPath(DIGESTS.latestWeights),
        ],
      },
      { manifest: small, digestCount: 2, blobPaths: [buildValueBlobPath(DIGESTS.smallConfig)] },
    ]);
  });

  test('offers no model whose blobs all belong to other models too', () => {
    const hexes = [DIGESTS.latestConfig, DIGESTS.shared];

    expect(
      decideOllamaModelOffers({
        state: buildValueState({
          manifests: [
            buildValueManifest({ tag: 'latest', hexes: hexes }),
            buildValueManifest({ tag: 'alias', hexes: hexes }),
          ],
          blobHexes: hexes,
        }),
      }),
    ).toEqual([]);
  });

  test('offers nothing while a manifest is unread or a stray entry sits among them', () => {
    const latest = buildValueManifest({ tag: 'latest', hexes: [DIGESTS.latestConfig] });
    const blobHexes = [DIGESTS.latestConfig];

    expect(
      decideOllamaModelOffers({
        state: buildValueState({
          manifests: [latest, buildValueManifest({ tag: 'broken', hexes: null })],
          blobHexes: blobHexes,
        }),
      }),
    ).toBeNull();
    expect(
      decideOllamaModelOffers({
        state: buildValueState({
          manifests: [latest],
          blobHexes: blobHexes,
          isEveryEntryKnown: false,
        }),
      }),
    ).toBeNull();
  });
});

describe('compareOllamaModelUnit', () => {
  const latest = buildValueManifest({
    tag: 'latest',
    hexes: [DIGESTS.latestConfig, DIGESTS.latestWeights, DIGESTS.shared],
  });
  const small = buildValueManifest({ tag: 'small', hexes: [DIGESTS.smallConfig, DIGESTS.shared] });
  const scanned = buildValueState({
    manifests: [latest, small],
    blobHexes: [DIGESTS.latestConfig, DIGESTS.latestWeights, DIGESTS.smallConfig, DIGESTS.shared],
  });
  const scannedFindings = buildOllamaModelFindings({
    state: scanned,
    runningProcesses: buildRunningCommandLines([]),
  });

  test('is unchanged once the model it shared a blob with is gone, so the blob is its own', () => {
    const afterLatest = buildValueState({
      manifests: [small],
      blobHexes: [DIGESTS.smallConfig, DIGESTS.shared],
    });

    expect(
      compareOllamaModelUnit({
        unit: getModelUnit({ findings: scannedFindings, manifestPath: small.path }),
        state: afterLatest,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once a new manifest names one of its blobs', () => {
    const copy = buildValueManifest({ tag: 'copy', hexes: [DIGESTS.extra, DIGESTS.latestWeights] });

    expect(
      compareOllamaModelUnit({
        unit: getModelUnit({ findings: scannedFindings, manifestPath: latest.path }),
        state: buildValueState({
          manifests: [latest, small, copy],
          blobHexes: [
            DIGESTS.latestConfig,
            DIGESTS.latestWeights,
            DIGESTS.smallConfig,
            DIGESTS.shared,
            DIGESTS.extra,
          ],
        }),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed once its manifest is written again, whatever blobs it names', () => {
    const pulledAgain = { ...latest, modifiedMs: NOW_MS };

    expect(
      compareOllamaModelUnit({
        unit: getModelUnit({ findings: scannedFindings, manifestPath: latest.path }),
        state: buildValueState({
          manifests: [pulledAgain, small],
          blobHexes: [
            DIGESTS.latestConfig,
            DIGESTS.latestWeights,
            DIGESTS.smallConfig,
            DIGESTS.shared,
          ],
        }),
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while Ollama runs', () => {
    expect(
      compareOllamaModelUnit({
        unit: getModelUnit({ findings: scannedFindings, manifestPath: latest.path }),
        state: scanned,
        runningProcesses: buildRunningCommandLines(['ollama run llama3']),
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('parseOllamaModelName', () => {
  test("reads the four folder names of a manifest's path, with an escaped colon as a colon", () => {
    expect(
      parseOllamaModelName({ pathNames: ['ollama.com', 'library', 'model', 'tag%3Aq4%3aK'] }),
    ).toEqual({ host: 'ollama.com', namespace: 'library', model: 'model', tag: 'tag:q4:K' });
  });

  test('reads no name from a path of another depth', () => {
    expect(parseOllamaModelName({ pathNames: ['ollama.com', 'library', 'model'] })).toBeNull();
    expect(
      parseOllamaModelName({ pathNames: ['ollama.com', 'library', 'model', 'tag', 'extra'] }),
    ).toBeNull();
  });
});

describe('formatOllamaModelName', () => {
  test("names a model of Ollama's own library by its model and tag", () => {
    expect(
      formatOllamaModelName({
        name: { host: 'registry.ollama.ai', namespace: 'library', model: 'llama3', tag: 'latest' },
      }),
    ).toBe('llama3:latest');
    expect(
      formatOllamaModelName({
        name: { host: 'ollama.com', namespace: 'library', model: 'qwen3', tag: '8b' },
      }),
    ).toBe('qwen3:8b');
  });

  test('puts the namespace, or the host of another registry, before it', () => {
    expect(
      formatOllamaModelName({
        name: { host: 'registry.ollama.ai', namespace: 'someone', model: 'model', tag: 'v1' },
      }),
    ).toBe('someone/model:v1');
    expect(
      formatOllamaModelName({
        name: { host: 'hf.co', namespace: 'org', model: 'repo', tag: 'Q4_K_M' },
      }),
    ).toBe('hf.co/org/repo:Q4_K_M');
  });
});

describe('loadOllamaModelFindings', () => {
  test('offers each model with only the blobs no other manifest names', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });

        const probed = await loadFindings({ environment: environment });
        const latest = getModelUnit({
          findings: probed,
          manifestPath: buildManifestPath({ home: environment, tag: 'latest' }),
        });
        const small = getModelUnit({
          findings: probed,
          manifestPath: buildManifestPath({ home: environment, tag: 'small' }),
        });

        expect(probed.isComplete).toBe(true);
        expect(probed.findings.map((finding) => [finding.risk, finding.activity])).toEqual([
          ['review', 'idle'],
          ['review', 'idle'],
        ]);
        expect(latest.modelName).toBe('llama3:latest');
        expect(latest.downloadedAtMs).toBe(MANIFEST_MODIFIED_MS);
        expect<string[]>([...latest.foundPaths].toSorted()).toEqual(
          [
            buildManifestPath({ home: environment, tag: 'latest' }),
            buildBlobPath({ home: environment, hex: DIGESTS.latestConfig }),
            buildBlobPath({ home: environment, hex: DIGESTS.latestWeights }),
          ].toSorted(),
        );
        expect<string[]>([...small.foundPaths].toSorted()).toEqual(
          [
            buildManifestPath({ home: environment, tag: 'small' }),
            buildBlobPath({ home: environment, hex: DIGESTS.smallConfig }),
          ].toSorted(),
        );
      },
    });
  });

  test('offers nothing and is incomplete while a manifest does not parse', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });
        await writeFixtureTextFile({
          path: buildManifestPath({ home: environment, tag: 'broken' }),
          text: '{',
        });

        expect(await loadFindings({ environment: environment })).toEqual({
          findings: [],
          isComplete: false,
        });
      },
    });
  });

  test('offers nothing and is incomplete beside a stray file where a folder belongs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });
        await writeFixtureTextFile({
          path: join(buildModelsPath({ home: environment }), 'manifests', 'stray'),
          text: buildManifestText({ configHex: DIGESTS.latestWeights, layerHexes: [] }),
        });

        expect(await loadFindings({ environment: environment })).toEqual({
          findings: [],
          isComplete: false,
        });
      },
    });
  });

  test('finds no model and is complete without the manifests folders', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        expect(await loadFindings({ environment: environment })).toEqual({
          findings: [],
          isComplete: true,
        });
      },
    });
  });

  test('marks each model busy while Ollama runs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });

        const probed = await loadFindings({
          environment: environment,
          runningProcesses: buildRunningCommandLines([
            '/Applications/Ollama.app/Contents/Resources/ollama serve',
          ]),
        });

        expect(probed.findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
      },
    });
  });
});

describe('recheckOllamaModelUnit', () => {
  test('is unchanged while the model keeps its blobs, and busy while Ollama runs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });

        const unit = getModelUnit({
          findings: await loadFindings({ environment: environment }),
          manifestPath: buildManifestPath({ home: environment, tag: 'latest' }),
        });

        expect(await recheck({ unit: unit, environment: environment, commandLines: [] })).toEqual({
          kind: 'unchanged',
        });
        expect(
          await recheck({
            unit: unit,
            environment: environment,
            commandLines: null,
          }),
        ).toEqual({ kind: 'busy' });
      },
    });
  });

  test('is changed once a new manifest names one of its blobs', async () => {
    await withFixtureHome({
      nowMs: NOW_MS,
      run: async (home) => {
        const environment = home.environment;

        await createTwoModels({ home: environment });

        const unit = getModelUnit({
          findings: await loadFindings({ environment: environment }),
          manifestPath: buildManifestPath({ home: environment, tag: 'latest' }),
        });

        await writeBlobs({ home: environment, hexes: [DIGESTS.extra] });
        await writeManifest({
          home: environment,
          tag: 'copy',
          configHex: DIGESTS.extra,
          layerHexes: [DIGESTS.latestWeights],
        });

        expect(await recheck({ unit: unit, environment: environment, commandLines: [] })).toEqual({
          kind: 'changed',
        });
      },
    });
  });
});
