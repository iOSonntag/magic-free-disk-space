import { expect, test } from 'bun:test';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExploreProbeFindings, ExploreUnit } from '../../src/explore/exploreUnit.js';
import { listUnitPaths } from '../../src/explore/exploreUnit.js';
import { formatHuggingFaceRepoName } from '../../src/explore/huggingFace/buildHuggingFaceRepoFindings.js';
import { loadHuggingFaceRepoFindings } from '../../src/explore/huggingFace/loadHuggingFaceRepoFindings.js';
import { recheckHuggingFaceUnit } from '../../src/explore/huggingFace/recheckHuggingFaceUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const HOUR_MS = 60 * 60 * 1000;

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const CURRENT_SNAPSHOT_MODIFIED_MS = NOW_MS - 5 * 24 * HOUR_MS;

const OLD_SNAPSHOT_MODIFIED_MS = NOW_MS - 40 * 24 * HOUR_MS;

const CURRENT_COMMIT = 'a'.repeat(40);

const OLD_COMMIT = 'b'.repeat(40);

const REPO_FOLDER_NAME = 'models--example-org--example-model';

type HubFixture = {
  environment: Environment;
  huggingFacePath: string;
  repoPath: string;
};

/** Builds a temporary home, hands it to `run`, and removes it afterwards, whatever `run` does. */
async function withHuggingFaceHome(params: {
  run: (fixture: HubFixture) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
    const huggingFacePath = join(environment.homeDir, '.cache', 'huggingface');

    await params.run({
      environment: environment,
      huggingFacePath: huggingFacePath,
      repoPath: join(huggingFacePath, 'hub', REPO_FOLDER_NAME),
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
  const result = await loadHuggingFaceRepoFindings(
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
 * One repository as the hub cache lays it out: `main` names the current commit, an older
 * snapshot no ref names any longer, a blob both link, a link into the shared Xet store, a stale
 * and a fresh unfinished blob, and the token files beside the hub.
 */
async function createRepository(fixture: HubFixture): Promise<void> {
  const blobsPath = join(fixture.repoPath, 'blobs');
  const xetChunkPath = join(fixture.huggingFacePath, 'xet', 'chunk');

  await writeFixtureTextFile({ path: join(fixture.huggingFacePath, 'token'), text: 'fixture' });
  await writeFixtureTextFile({
    path: join(fixture.huggingFacePath, 'stored_tokens'),
    text: '[fixture]\nhf_token = fixture\n',
  });
  await writeFixtureTextFile({ path: xetChunkPath, text: 'xet' });
  await writeFixtureTextFile({
    path: join(fixture.repoPath, 'refs', 'main'),
    text: CURRENT_COMMIT,
  });
  await writeFixtureTextFile({
    path: join(fixture.repoPath, '.no_exist', CURRENT_COMMIT, 'missing.json'),
    text: '',
  });
  await createFixtureDirectory({ path: blobsPath });

  for (const name of ['shared', 'current', 'old']) {
    await createFixtureFile({ path: join(blobsPath, name), sizeBytes: 4096, modifiedMs: NOW_MS });
  }

  await createFixtureFile({
    path: join(blobsPath, 'stale.incomplete'),
    sizeBytes: 4096,
    modifiedMs: NOW_MS - 2 * 24 * HOUR_MS,
  });
  await createFixtureFile({
    path: join(blobsPath, 'fresh.incomplete'),
    sizeBytes: 4096,
    modifiedMs: NOW_MS - HOUR_MS,
  });
  await symlink(join('..', '..', '..', 'xet', 'chunk'), join(blobsPath, 'xet-linked'));
  await createSnapshot({
    fixture: fixture,
    commit: CURRENT_COMMIT,
    links: { 'config.json': 'shared', 'weights.bin': 'current' },
    modifiedMs: CURRENT_SNAPSHOT_MODIFIED_MS,
  });
  await createSnapshot({
    fixture: fixture,
    commit: OLD_COMMIT,
    links: { 'config.json': 'shared', 'weights.bin': 'old', 'chunk.bin': 'xet-linked' },
    modifiedMs: OLD_SNAPSHOT_MODIFIED_MS,
  });
}

/** A snapshot folder whose files link into `blobs`, as `<file>` to `../../blobs/<blob>`. */
async function createSnapshot(params: {
  fixture: HubFixture;
  commit: string;
  links: Record<string, string>;
  modifiedMs: number;
}): Promise<void> {
  const snapshotPath = join(params.fixture.repoPath, 'snapshots', params.commit);

  await createFixtureDirectory({ path: snapshotPath });

  for (const [fileName, blobName] of Object.entries(params.links)) {
    await symlink(join('..', '..', 'blobs', blobName), join(snapshotPath, fileName));
  }

  await updateModifiedMs({ path: snapshotPath, modifiedMs: params.modifiedMs });
}

function findUnit(params: {
  findings: ExploreProbeFindings;
  kind: ExploreUnit['kind'];
}): ExploreUnit {
  const unit = params.findings.findings
    .map((finding) => finding.unit)
    .find((candidate) => candidate.kind === params.kind);

  if (unit === undefined) {
    throw new Error(`No unit of the kind ${params.kind} was offered.`);
  }

  return unit;
}

function listSortedPaths(unit: ExploreUnit): string[] {
  return listUnitPaths(unit).toSorted();
}

describeAwaitingWin32Platform('loadHuggingFaceRepoFindings', () => {
  test('splits a repository into its current revisions, its detached ones, and its stale partials', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const blobsPath = join(fixture.repoPath, 'blobs');
        const snapshotsPath = join(fixture.repoPath, 'snapshots');

        expect(probed.isComplete).toBe(true);
        expect(probed.findings.map((finding) => [finding.unit.kind, finding.risk])).toEqual([
          ['huggingFaceRepository', 'review'],
          ['huggingFaceDetachedRevisions', 'safe'],
          ['huggingFacePartialDownloads', 'safe'],
        ]);
        expect(
          listSortedPaths(findUnit({ findings: probed, kind: 'huggingFaceRepository' })),
        ).toEqual(
          [
            join(fixture.repoPath, '.no_exist'),
            join(fixture.repoPath, 'refs'),
            join(snapshotsPath, CURRENT_COMMIT),
            join(blobsPath, 'current'),
            join(blobsPath, 'shared'),
          ].toSorted(),
        );
        expect(
          listSortedPaths(findUnit({ findings: probed, kind: 'huggingFaceDetachedRevisions' })),
        ).toEqual([join(snapshotsPath, OLD_COMMIT), join(blobsPath, 'old')].toSorted());
        expect(
          listSortedPaths(findUnit({ findings: probed, kind: 'huggingFacePartialDownloads' })),
        ).toEqual([join(blobsPath, 'stale.incomplete')]);
      },
    });
  });

  test('gives the current and the detached revisions the time of their newest snapshot', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const repository = findUnit({ findings: probed, kind: 'huggingFaceRepository' });
        const detached = findUnit({ findings: probed, kind: 'huggingFaceDetachedRevisions' });

        expect(repository.kind === 'huggingFaceRepository' && repository.downloadedAtMs).toBe(
          CURRENT_SNAPSHOT_MODIFIED_MS,
        );
        expect(detached.kind === 'huggingFaceDetachedRevisions' && detached.revisions).toEqual([
          OLD_COMMIT,
        ]);
        expect(detached.kind === 'huggingFaceDetachedRevisions' && detached.downloadedAtMs).toBe(
          OLD_SNAPSHOT_MODIFIED_MS,
        );
      },
    });
  });

  test('never offers the token files, the shared Xet store, a link in blobs, or a fresh partial', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const paths = probed.findings.flatMap((finding) => listUnitPaths(finding.unit));
        const hubPrefix = `${join(fixture.huggingFacePath, 'hub')}/`;

        expect(paths.filter((path) => !path.startsWith(hubPrefix))).toEqual([]);
        expect(
          paths
            .map((path) => path.slice(hubPrefix.length))
            .filter((path) => /token|xet|fresh/.test(path)),
        ).toEqual([]);
      },
    });
  });

  test('offers only the stale partials and is incomplete while a ref names no commit', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);
        await writeFixtureTextFile({ path: join(fixture.repoPath, 'refs', 'main'), text: 'main' });

        const probed = await loadFindings({ environment: fixture.environment });

        expect(probed.isComplete).toBe(false);
        expect(probed.findings.map((finding) => finding.unit.kind)).toEqual([
          'huggingFacePartialDownloads',
        ]);
      },
    });
  });

  test('marks each unit busy while the Hugging Face CLI runs', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({
          environment: fixture.environment,
          processCommands: ['/opt/homebrew/bin/hf download example-org/example-model'],
        });

        expect(probed.findings.map((finding) => finding.activity)).toEqual([
          'busy',
          'busy',
          'busy',
        ]);
      },
    });
  });
});

describeAwaitingWin32Platform('recheckHuggingFaceUnit', () => {
  test('is unchanged while the repository holds the same paths, and busy while the CLI runs', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });

        for (const finding of probed.findings) {
          const unit = finding.unit;

          if (
            unit.kind !== 'huggingFaceRepository' &&
            unit.kind !== 'huggingFaceDetachedRevisions' &&
            unit.kind !== 'huggingFacePartialDownloads'
          ) {
            throw new Error('The probe offered a unit of another kind.');
          }

          const recheck = (processCommands: string[] | null) =>
            recheckHuggingFaceUnit({
              unit: unit,
              environment: fixture.environment,
              platform: buildTestProbePlatform(),
              processCommands: processCommands,
            });

          expect(await recheck([])).toEqual({ kind: 'unchanged' });
          expect(await recheck(['huggingface-cli download example-org/example-model'])).toEqual({
            kind: 'busy',
          });
          expect(await recheck(null)).toEqual({ kind: 'busy' });
        }
      },
    });
  });

  test('is changed once a ref moves to another revision', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const repository = findUnit({ findings: probed, kind: 'huggingFaceRepository' });
        const detached = findUnit({ findings: probed, kind: 'huggingFaceDetachedRevisions' });

        await writeFixtureTextFile({
          path: join(fixture.repoPath, 'refs', 'main'),
          text: OLD_COMMIT,
        });

        for (const unit of [repository, detached]) {
          if (
            unit.kind !== 'huggingFaceRepository' &&
            unit.kind !== 'huggingFaceDetachedRevisions'
          ) {
            throw new Error('The probe offered a unit of another kind.');
          }

          expect(
            await recheckHuggingFaceUnit({
              unit: unit,
              environment: fixture.environment,
              platform: buildTestProbePlatform(),
              processCommands: [],
            }),
          ).toEqual({ kind: 'changed' });
        }
      },
    });
  });

  test('is changed once a stale partial download is written to again', async () => {
    await withHuggingFaceHome({
      run: async (fixture) => {
        await createRepository(fixture);

        const partial = findUnit({
          findings: await loadFindings({ environment: fixture.environment }),
          kind: 'huggingFacePartialDownloads',
        });

        await updateModifiedMs({
          path: join(fixture.repoPath, 'blobs', 'stale.incomplete'),
          modifiedMs: NOW_MS,
        });

        if (partial.kind !== 'huggingFacePartialDownloads') {
          throw new Error('The probe offered a unit of another kind.');
        }

        expect(
          await recheckHuggingFaceUnit({
            unit: partial,
            environment: fixture.environment,
            platform: buildTestProbePlatform(),
            processCommands: [],
          }),
        ).toEqual({ kind: 'changed' });
      },
    });
  });
});

describeAwaitingWin32Platform('formatHuggingFaceRepoName', () => {
  test('names a repository by its type and its owner and name', () => {
    expect(formatHuggingFaceRepoName({ folderName: 'models--example-org--example-model' })).toBe(
      'model example-org/example-model',
    );
    expect(formatHuggingFaceRepoName({ folderName: 'datasets--example-org--corpus' })).toBe(
      'dataset example-org/corpus',
    );
  });
});
