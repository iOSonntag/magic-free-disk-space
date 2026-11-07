import { expect, test } from 'bun:test';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type {
  ExplorePathUnitOllamaModel,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { formatOllamaModelName } from '../../src/explore/ollamaModels/buildOllamaModelFindings.js';
import { loadOllamaModelFindings } from '../../src/explore/ollamaModels/loadOllamaModelFindings.js';
import { recheckOllamaModelUnit } from '../../src/explore/ollamaModels/recheckOllamaModelUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const NOW_MS = Date.now();

const BLOB_MODIFIED_MS = NOW_MS - 3 * 24 * 60 * 60 * 1000;

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

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withOllamaHome(params: {
  run: (environment: Environment) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    await params.run(await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS }));
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
  const result = await loadOllamaModelFindings(
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

function buildModelsPath(params: { environment: Environment }): string {
  return join(params.environment.homeDir, '.ollama', 'models');
}

function buildBlobPath(params: { environment: Environment; hex: string }): string {
  return join(buildModelsPath(params), 'blobs', `sha256-${params.hex}`);
}

/** The manifest of a tag of the model `llama3` in Ollama's own library. */
function buildManifestPath(params: { environment: Environment; tag: string }): string {
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

async function writeManifest(params: {
  environment: Environment;
  tag: string;
  configHex: string;
  layerHexes: string[];
}): Promise<void> {
  await writeFixtureTextFile({
    path: buildManifestPath(params),
    text: buildManifestText(params),
  });
}

async function writeBlobs(params: { environment: Environment; hexes: string[] }): Promise<void> {
  await createFixtureDirectory({ path: join(buildModelsPath(params), 'blobs') });

  for (const hex of params.hexes) {
    await createFixtureFile({
      path: buildBlobPath({ environment: params.environment, hex: hex }),
      sizeBytes: 4096,
      modifiedMs: BLOB_MODIFIED_MS,
    });
  }
}

/** Two tags of one model that share a layer: `latest` and `small`. */
async function createTwoModels(params: { environment: Environment }): Promise<void> {
  await writeBlobs({
    environment: params.environment,
    hexes: [DIGESTS.latestConfig, DIGESTS.latestWeights, DIGESTS.smallConfig, DIGESTS.shared],
  });
  await writeManifest({
    environment: params.environment,
    tag: 'latest',
    configHex: DIGESTS.latestConfig,
    layerHexes: [DIGESTS.latestWeights, DIGESTS.shared],
  });
  await writeManifest({
    environment: params.environment,
    tag: 'small',
    configHex: DIGESTS.smallConfig,
    layerHexes: [DIGESTS.shared],
  });
}

function findUnit(params: {
  findings: ExploreProbeFindings;
  environment: Environment;
  tag: string;
}): ExplorePathUnitOllamaModel {
  const manifestPath = buildManifestPath(params);
  const unit = params.findings.findings
    .map((finding) => finding.unit)
    .find(
      (candidate) => candidate.kind === 'ollamaModel' && candidate.manifestPath === manifestPath,
    );

  if (unit === undefined || unit.kind !== 'ollamaModel') {
    throw new Error('The model was not offered.');
  }

  return unit;
}

function recheck(params: {
  unit: ExplorePathUnitOllamaModel;
  environment: Environment;
  processCommands: string[] | null;
}) {
  return recheckOllamaModelUnit({
    unit: params.unit,
    environment: params.environment,
    platform: buildTestProbePlatform(),
    processCommands: params.processCommands,
  });
}

describeAwaitingWin32Platform('loadOllamaModelFindings', () => {
  test('offers each model with only the blobs no other manifest names', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });

        const probed = await loadFindings({ environment: environment });
        const latest = findUnit({ findings: probed, environment: environment, tag: 'latest' });
        const small = findUnit({ findings: probed, environment: environment, tag: 'small' });

        expect(probed.isComplete).toBe(true);
        expect(probed.findings).toHaveLength(2);
        expect(latest.modelName).toBe('llama3:latest');
        expect<string[]>([...latest.foundPaths].toSorted()).toEqual(
          [
            buildManifestPath({ environment: environment, tag: 'latest' }),
            buildBlobPath({ environment: environment, hex: DIGESTS.latestConfig }),
            buildBlobPath({ environment: environment, hex: DIGESTS.latestWeights }),
          ].toSorted(),
        );
        expect<string[]>([...small.foundPaths].toSorted()).toEqual(
          [
            buildManifestPath({ environment: environment, tag: 'small' }),
            buildBlobPath({ environment: environment, hex: DIGESTS.smallConfig }),
          ].toSorted(),
        );
      },
    });
  });

  test('never makes a blob another manifest names a target of either model', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });

        const probed = await loadFindings({ environment: environment });
        const sharedPath = buildBlobPath({ environment: environment, hex: DIGESTS.shared });

        expect(
          probed.findings.flatMap((finding) =>
            finding.unit.kind === 'ollamaModel' ? finding.unit.foundPaths : [],
          ),
        ).not.toContain(sharedPath);
        expect(probed.findings.map((finding) => finding.risk)).toEqual(['review', 'review']);
        expect(probed.findings.map((finding) => finding.activity)).toEqual(['idle', 'idle']);
      },
    });
  });

  test('offers no model whose blobs all belong to other models too', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await writeBlobs({
          environment: environment,
          hexes: [DIGESTS.shared, DIGESTS.latestConfig],
        });

        for (const tag of ['latest', 'alias']) {
          await writeManifest({
            environment: environment,
            tag: tag,
            configHex: DIGESTS.latestConfig,
            layerHexes: [DIGESTS.shared],
          });
        }

        expect(await loadFindings({ environment: environment })).toEqual({
          findings: [],
          isComplete: true,
        });
      },
    });
  });

  test('offers nothing and is incomplete while a manifest does not parse', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });
        await writeFixtureTextFile({
          path: buildManifestPath({ environment: environment, tag: 'broken' }),
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
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });
        await writeFixtureTextFile({
          path: join(buildModelsPath({ environment: environment }), 'manifests', 'stray'),
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
    await withOllamaHome({
      run: async (environment) => {
        expect(await loadFindings({ environment: environment })).toEqual({
          findings: [],
          isComplete: true,
        });
      },
    });
  });

  test('marks each model busy while Ollama runs', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });

        const probed = await loadFindings({
          environment: environment,
          processCommands: ['/Applications/Ollama.app/Contents/Resources/ollama serve'],
        });

        expect(probed.findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
      },
    });
  });
});

describeAwaitingWin32Platform('recheckOllamaModelUnit', () => {
  test('is unchanged while the model keeps its blobs, and busy while Ollama runs', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });

        const unit = findUnit({
          findings: await loadFindings({ environment: environment }),
          environment: environment,
          tag: 'latest',
        });

        expect(
          await recheck({ unit: unit, environment: environment, processCommands: [] }),
        ).toEqual({ kind: 'unchanged' });
        expect(
          await recheck({
            unit: unit,
            environment: environment,
            processCommands: ['ollama run llama3'],
          }),
        ).toEqual({ kind: 'busy' });
        expect(
          await recheck({ unit: unit, environment: environment, processCommands: null }),
        ).toEqual({ kind: 'busy' });
      },
    });
  });

  test('is changed once a new manifest names one of its blobs', async () => {
    await withOllamaHome({
      run: async (environment) => {
        await createTwoModels({ environment: environment });

        const unit = findUnit({
          findings: await loadFindings({ environment: environment }),
          environment: environment,
          tag: 'latest',
        });

        await writeBlobs({ environment: environment, hexes: [DIGESTS.extra] });
        await writeManifest({
          environment: environment,
          tag: 'copy',
          configHex: DIGESTS.extra,
          layerHexes: [DIGESTS.latestWeights],
        });

        expect(
          await recheck({ unit: unit, environment: environment, processCommands: [] }),
        ).toEqual({ kind: 'changed' });
      },
    });
  });
});

describeAwaitingWin32Platform('formatOllamaModelName', () => {
  test("names a model of Ollama's own library by its model and tag", () => {
    expect(
      formatOllamaModelName({ nameParts: ['registry.ollama.ai', 'library', 'llama3', 'latest'] }),
    ).toBe('llama3:latest');
    expect(formatOllamaModelName({ nameParts: ['ollama.com', 'library', 'qwen3', '8b'] })).toBe(
      'qwen3:8b',
    );
  });

  test('puts the namespace, or the host of another registry, before it', () => {
    expect(
      formatOllamaModelName({ nameParts: ['registry.ollama.ai', 'someone', 'model', 'v1'] }),
    ).toBe('someone/model:v1');
    expect(formatOllamaModelName({ nameParts: ['hf.co', 'org', 'repo', 'Q4_K_M'] })).toBe(
      'hf.co/org/repo:Q4_K_M',
    );
  });

  test('reads an escaped colon as a colon', () => {
    expect(
      formatOllamaModelName({ nameParts: ['ollama.com', 'library', 'model', 'tag%3Aq4'] }),
    ).toBe('model:tag:q4');
  });
});
