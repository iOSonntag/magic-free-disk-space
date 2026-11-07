import { describe, expect, test } from 'bun:test';
import { symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExplorePathUnitHuggingFacePartialDownloads,
  ExploreProbeFindings,
  ExploreUnit,
} from '../../src/explore/exploreUnit.js';
import { listUnitPaths } from '../../src/explore/exploreUnit.js';
import {
  buildHuggingFaceRepoFindings,
  formatHuggingFaceRepoName,
} from '../../src/explore/huggingFace/buildHuggingFaceRepoFindings.js';
import { compareHuggingFaceUnit } from '../../src/explore/huggingFace/compareHuggingFaceUnit.js';
import { decideHuggingFaceRepoOffers } from '../../src/explore/huggingFace/decideHuggingFaceRepoOffers.js';
import type {
  HuggingFaceBlob,
  HuggingFaceRepoState,
  HuggingFaceSnapshot,
} from '../../src/explore/huggingFace/loadHuggingFaceHubState.js';
import { loadHuggingFaceRepoFindings } from '../../src/explore/huggingFace/loadHuggingFaceRepoFindings.js';
import { parseHuggingFaceRepoFolderName } from '../../src/explore/huggingFace/parseHuggingFaceRepoFolderName.js';
import { recheckHuggingFaceUnit } from '../../src/explore/huggingFace/recheckHuggingFaceUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  loadTestEnvironment,
  updateModifiedMs,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  buildTestProbeRun,
  DAY_MS,
  findUnitOfKind,
  getProbeFindings,
  withFixtureHome,
} from '../support/probeRunFixtures.js';

const HOUR_MS = 60 * 60 * 1000;

const NOW_MS = Math.floor(Date.now() / 1000) * 1000;

const CURRENT_SNAPSHOT_MODIFIED_MS = NOW_MS - 5 * DAY_MS;

const OLD_SNAPSHOT_MODIFIED_MS = NOW_MS - 40 * DAY_MS;

const CURRENT_COMMIT = 'a'.repeat(40);

const OLD_COMMIT = 'b'.repeat(40);

const REPO_FOLDER_NAME = 'models--example-org--example-model';

const VALUE_REPO_PATH = `/hub/${REPO_FOLDER_NAME}`;

const XET_HASH = 'c'.repeat(64);

const XET_HASH_PREFIX = XET_HASH.slice(0, 2);

/** The repository's blob `hf_xet` writes as a link to the copy it shares across repositories. */
const SHARED_LINK_BLOB_NAME = 'd'.repeat(40);

type HubFixture = {
  fixtureRoot: FixtureRoot;
  environment: Environment;
  huggingFacePath: string;
  repoPath: string;
};

async function withHubFixture(params: {
  run: (fixture: HubFixture) => Promise<void>;
}): Promise<void> {
  await withFixtureHome({
    nowMs: NOW_MS,
    run: async (home) => {
      const huggingFacePath = join(home.environment.homeDir, '.cache', 'huggingface');

      await params.run({
        fixtureRoot: home.fixtureRoot,
        environment: home.environment,
        huggingFacePath: huggingFacePath,
        repoPath: join(huggingFacePath, 'hub', REPO_FOLDER_NAME),
      });
    },
  });
}

async function loadFindings(params: {
  environment: Environment;
  processCommands?: string[] | null;
}): Promise<ExploreProbeFindings> {
  return getProbeFindings(await loadHuggingFaceRepoFindings(buildTestProbeRun(params)));
}

/**
 * One repository as the hub cache lays it out: `main` names the current commit, an older
 * snapshot no ref names any longer, whose weights link from a subfolder, a blob both link, a blob
 * both link that is itself a link to the copy `hf_xet` keeps in the hub cache's own `blobs` for
 * every repository, a stale and a fresh unfinished blob, the libraries' `.locks` beside the
 * repositories, and the token files beside the hub.
 */
async function createRepository(fixture: HubFixture): Promise<void> {
  const blobsPath = join(fixture.repoPath, 'blobs');

  await writeFixtureTextFile({ path: join(fixture.huggingFacePath, 'token'), text: 'fixture' });
  await writeFixtureTextFile({
    path: join(fixture.huggingFacePath, 'stored_tokens'),
    text: '[fixture]\nhf_token = fixture\n',
  });
  await writeFixtureTextFile({
    path: join(fixture.huggingFacePath, 'hub', '.locks', REPO_FOLDER_NAME, 'weights.lock'),
    text: '',
  });
  await writeFixtureTextFile({ path: getSharedCopyPath(fixture), text: 'shared copy' });
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
    modifiedMs: NOW_MS - 2 * DAY_MS,
  });
  await createFixtureFile({
    path: join(blobsPath, 'fresh.incomplete'),
    sizeBytes: 4096,
    modifiedMs: NOW_MS - HOUR_MS,
  });
  await symlink(
    join('..', '..', 'blobs', XET_HASH_PREFIX, XET_HASH),
    join(blobsPath, SHARED_LINK_BLOB_NAME),
  );
  await createSnapshot({
    fixture: fixture,
    commit: CURRENT_COMMIT,
    links: {
      'config.json': 'shared',
      'weights.bin': 'current',
      'model.safetensors': SHARED_LINK_BLOB_NAME,
    },
    modifiedMs: CURRENT_SNAPSHOT_MODIFIED_MS,
  });
  await createSnapshot({
    fixture: fixture,
    commit: OLD_COMMIT,
    links: {
      'config.json': 'shared',
      'onnx/weights.bin': 'old',
      'model.safetensors': SHARED_LINK_BLOB_NAME,
    },
    modifiedMs: OLD_SNAPSHOT_MODIFIED_MS,
  });
}

/** The one copy of a Xet file at `<hub>/blobs/<prefix>/<xet_hash>`, as `hf_xet` shares it. */
function getSharedCopyPath(fixture: HubFixture): string {
  return join(fixture.huggingFacePath, 'hub', 'blobs', XET_HASH_PREFIX, XET_HASH);
}

/**
 * A snapshot folder whose files link into `blobs`, each as the relative link the libraries write,
 * such as `onnx/<file>` to `../../../blobs/<blob>`.
 */
async function createSnapshot(params: {
  fixture: HubFixture;
  commit: string;
  links: Record<string, string>;
  modifiedMs: number;
}): Promise<void> {
  const snapshotPath = join(params.fixture.repoPath, 'snapshots', params.commit);

  await createFixtureDirectory({ path: snapshotPath });

  for (const [filePath, blobName] of Object.entries(params.links)) {
    const linkPath = join(snapshotPath, filePath);
    const upNames = filePath.split('/').map(() => '..');

    await createFixtureDirectory({ path: dirname(linkPath) });
    await symlink(join(...upNames, '..', 'blobs', blobName), linkPath);
  }

  await updateModifiedMs({ path: snapshotPath, modifiedMs: params.modifiedMs });
}

function listSortedPaths(unit: ExploreUnit): string[] {
  return listUnitPaths(unit).toSorted();
}

function buildValuePath(names: string[]): AbsolutePath {
  return buildTestAbsolutePath({ text: [VALUE_REPO_PATH, ...names].join('/') });
}

function buildValueBlob(params: { name: string; modifiedMs?: number }): HuggingFaceBlob {
  return {
    name: params.name,
    path: buildValuePath(['blobs', params.name]),
    modifiedMs: params.modifiedMs ?? NOW_MS,
  };
}

function buildValueSnapshot(params: {
  commit: string;
  linkedBlobNames: string[];
}): HuggingFaceSnapshot {
  return {
    commit: params.commit,
    path: buildValuePath(['snapshots', params.commit]),
    modifiedMs: NOW_MS,
    linkedBlobNames: new Set(params.linkedBlobNames),
  };
}

function buildValueRepo(params: {
  currentCommits: string[] | null;
  snapshots: HuggingFaceSnapshot[];
  blobs: HuggingFaceBlob[];
  linkedBlobCount?: number;
}): HuggingFaceRepoState {
  return {
    repoPath: buildTestAbsolutePath({ text: VALUE_REPO_PATH }),
    name: { repoType: 'model', repoId: 'example-org/example-model' },
    currentCommits: params.currentCommits === null ? null : new Set(params.currentCommits),
    snapshots: params.snapshots,
    blobs: params.blobs,
    linkedBlobCount: params.linkedBlobCount ?? 0,
    metadataPaths: [buildValuePath(['refs'])],
  };
}

describe('decideHuggingFaceRepoOffers', () => {
  test('keeps a blob a current and a detached revision both link with the current ones', () => {
    const offers = decideHuggingFaceRepoOffers({
      repo: buildValueRepo({
        currentCommits: [CURRENT_COMMIT],
        snapshots: [
          buildValueSnapshot({ commit: CURRENT_COMMIT, linkedBlobNames: ['shared', 'current'] }),
          buildValueSnapshot({ commit: OLD_COMMIT, linkedBlobNames: ['shared', 'old'] }),
        ],
        blobs: [
          buildValueBlob({ name: 'shared' }),
          buildValueBlob({ name: 'current' }),
          buildValueBlob({ name: 'old' }),
          buildValueBlob({ name: 'unlinked' }),
        ],
      }),
      partialCutoffMs: NOW_MS - DAY_MS,
    });

    expect(offers.isJudged).toBe(true);
    expect(offers.offers.map((offer) => [offer.kind, [...offer.paths].toSorted()])).toEqual([
      [
        'huggingFaceRepository',
        [
          buildValuePath(['refs']),
          buildValuePath(['snapshots', CURRENT_COMMIT]),
          buildValuePath(['blobs', 'shared']),
          buildValuePath(['blobs', 'current']),
          buildValuePath(['blobs', 'unlinked']),
        ].toSorted(),
      ],
      [
        'huggingFaceDetachedRevisions',
        [buildValuePath(['snapshots', OLD_COMMIT]), buildValuePath(['blobs', 'old'])].toSorted(),
      ],
    ]);
  });

  test('offers the unfinished blobs untouched since the cutoff, the cutoff itself included', () => {
    const cutoffMs = NOW_MS - DAY_MS;
    const offers = decideHuggingFaceRepoOffers({
      repo: buildValueRepo({
        currentCommits: [],
        snapshots: [],
        blobs: [
          buildValueBlob({ name: 'stale.incomplete', modifiedMs: cutoffMs - HOUR_MS }),
          buildValueBlob({ name: 'edge.incomplete', modifiedMs: cutoffMs }),
          buildValueBlob({ name: 'fresh.incomplete', modifiedMs: cutoffMs + 1 }),
        ],
      }),
      partialCutoffMs: cutoffMs,
    });

    expect(offers.offers).toEqual([
      {
        kind: 'huggingFacePartialDownloads',
        paths: [
          buildValuePath(['blobs', 'stale.incomplete']),
          buildValuePath(['blobs', 'edge.incomplete']),
        ],
      },
    ]);
  });

  test('offers only the stale partials, not judged, while the current revisions are unknown', () => {
    const offers = decideHuggingFaceRepoOffers({
      repo: buildValueRepo({
        currentCommits: null,
        snapshots: [buildValueSnapshot({ commit: OLD_COMMIT, linkedBlobNames: ['old'] })],
        blobs: [
          buildValueBlob({ name: 'old' }),
          buildValueBlob({ name: 'stale.incomplete', modifiedMs: NOW_MS - 2 * DAY_MS }),
        ],
      }),
      partialCutoffMs: NOW_MS - DAY_MS,
    });

    expect(offers.isJudged).toBe(false);
    expect(offers.offers.map((offer) => offer.kind)).toEqual(['huggingFacePartialDownloads']);
  });
});

describe('compareHuggingFaceUnit', () => {
  test('judges a partial unit by the cutoff of its scan, so a blob turned stale since is no change', () => {
    const scanCutoffMs = NOW_MS - DAY_MS;
    const unit: ExplorePathUnitHuggingFacePartialDownloads = {
      kind: 'huggingFacePartialDownloads',
      repoPath: buildTestAbsolutePath({ text: VALUE_REPO_PATH }),
      cutoffMs: scanCutoffMs,
      foundPaths: [buildValuePath(['blobs', 'stale.incomplete'])],
    };
    const repo = buildValueRepo({
      currentCommits: [],
      snapshots: [],
      blobs: [
        buildValueBlob({ name: 'stale.incomplete', modifiedMs: scanCutoffMs - HOUR_MS }),
        buildValueBlob({ name: 'later.incomplete', modifiedMs: scanCutoffMs + HOUR_MS }),
      ],
    });

    expect(compareHuggingFaceUnit({ unit: unit, repo: repo, processCommands: [] })).toEqual({
      kind: 'unchanged',
    });
  });
});

describe('parseHuggingFaceRepoFolderName', () => {
  test('reads the type and the id of a repository folder', () => {
    expect(parseHuggingFaceRepoFolderName('models--example-org--example-model')).toEqual({
      repoType: 'model',
      repoId: 'example-org/example-model',
    });
    expect(parseHuggingFaceRepoFolderName('datasets--corpus')).toEqual({
      repoType: 'dataset',
      repoId: 'corpus',
    });
    expect(parseHuggingFaceRepoFolderName('kernels--example-org--kernel')?.repoType).toBe('kernel');
  });

  test('reads no repository from another name', () => {
    for (const folderName of ['.locks', 'models', 'models--', 'model--a--b', 'models--a----b']) {
      expect(parseHuggingFaceRepoFolderName(folderName)).toBeNull();
    }
  });
});

describe('buildHuggingFaceRepoFindings', () => {
  test('says the linked files stay only for a repository that links some', () => {
    function listEvidenceLines(linkedBlobCount: number): string[][] {
      return buildHuggingFaceRepoFindings({
        repos: [
          buildValueRepo({
            currentCommits: [CURRENT_COMMIT],
            snapshots: [buildValueSnapshot({ commit: CURRENT_COMMIT, linkedBlobNames: [] })],
            blobs: [],
            linkedBlobCount: linkedBlobCount,
          }),
        ],
        partialCutoffMs: NOW_MS - DAY_MS,
        processCommands: [],
      }).findings.map((finding) => finding.evidenceLines);
    }

    expect(listEvidenceLines(0)).toEqual([['Its refs name 1 downloaded revision.']]);
    expect(listEvidenceLines(2)).toEqual([
      [
        'Its refs name 1 downloaded revision.',
        '2 of its files are links to copies that stay, such as those the hub cache shares across repositories.',
      ],
    ]);
  });
});

describe('formatHuggingFaceRepoName', () => {
  test('names a repository by its type and its id', () => {
    expect(
      formatHuggingFaceRepoName({
        name: { repoType: 'dataset', repoId: 'example-org/corpus' },
      }),
    ).toBe('dataset example-org/corpus');
  });
});

describeAwaitingWin32Platform('loadHuggingFaceRepoFindings', () => {
  test('splits a repository into its current revisions, its detached ones, and its stale partials', async () => {
    await withHubFixture({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const blobsPath = join(fixture.repoPath, 'blobs');
        const snapshotsPath = join(fixture.repoPath, 'snapshots');
        const repository = findUnitOfKind({ findings: probed, kind: 'huggingFaceRepository' });
        const detached = findUnitOfKind({ findings: probed, kind: 'huggingFaceDetachedRevisions' });
        const partial = findUnitOfKind({ findings: probed, kind: 'huggingFacePartialDownloads' });

        expect(probed.isComplete).toBe(true);
        expect(probed.findings.map((finding) => [finding.unit.kind, finding.risk])).toEqual([
          ['huggingFaceRepository', 'review'],
          ['huggingFaceDetachedRevisions', 'safe'],
          ['huggingFacePartialDownloads', 'safe'],
        ]);
        expect(probed.findings.map((finding) => finding.title)).toEqual([
          'Hugging Face model example-org/example-model',
          'Old revisions of Hugging Face model example-org/example-model',
          'Unfinished downloads of Hugging Face model example-org/example-model',
        ]);
        expect(probed.findings[0]?.evidenceLines).toEqual([
          'Its refs name 1 downloaded revision.',
          '1 of its files is a link to a copy that stays, such as one the hub cache shares across repositories.',
        ]);
        expect(listSortedPaths(repository)).toEqual(
          [
            join(fixture.repoPath, '.no_exist'),
            join(fixture.repoPath, 'refs'),
            join(snapshotsPath, CURRENT_COMMIT),
            join(blobsPath, 'current'),
            join(blobsPath, 'shared'),
          ].toSorted(),
        );
        expect(repository.downloadedAtMs).toBe(CURRENT_SNAPSHOT_MODIFIED_MS);
        expect(listSortedPaths(detached)).toEqual(
          [join(snapshotsPath, OLD_COMMIT), join(blobsPath, 'old')].toSorted(),
        );
        expect(detached.revisions).toEqual([OLD_COMMIT]);
        expect(detached.downloadedAtMs).toBe(OLD_SNAPSHOT_MODIFIED_MS);
        expect(listSortedPaths(partial)).toEqual([join(blobsPath, 'stale.incomplete')]);
        expect(partial.cutoffMs).toBe(NOW_MS - DAY_MS);
      },
    });
  });

  test('offers only the stale partials and is incomplete while a ref names no commit', async () => {
    await withHubFixture({
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
    await withHubFixture({
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
    await withHubFixture({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const units = [
          findUnitOfKind({ findings: probed, kind: 'huggingFaceRepository' }),
          findUnitOfKind({ findings: probed, kind: 'huggingFaceDetachedRevisions' }),
          findUnitOfKind({ findings: probed, kind: 'huggingFacePartialDownloads' }),
        ];

        for (const unit of units) {
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

  test('keeps a partial unit unchanged a day later, when its fresh partial has turned stale', async () => {
    await withHubFixture({
      run: async (fixture) => {
        await createRepository(fixture);

        const partial = findUnitOfKind({
          findings: await loadFindings({ environment: fixture.environment }),
          kind: 'huggingFacePartialDownloads',
        });
        const dayLater = await loadTestEnvironment({
          fixtureRoot: fixture.fixtureRoot,
          nowMs: NOW_MS + DAY_MS,
        });

        expect(
          await recheckHuggingFaceUnit({
            unit: partial,
            environment: dayLater,
            platform: buildTestProbePlatform(),
            processCommands: [],
          }),
        ).toEqual({ kind: 'unchanged' });
      },
    });
  });

  test('is changed once a ref moves to another revision', async () => {
    await withHubFixture({
      run: async (fixture) => {
        await createRepository(fixture);

        const probed = await loadFindings({ environment: fixture.environment });
        const units = [
          findUnitOfKind({ findings: probed, kind: 'huggingFaceRepository' }),
          findUnitOfKind({ findings: probed, kind: 'huggingFaceDetachedRevisions' }),
        ];

        await writeFixtureTextFile({
          path: join(fixture.repoPath, 'refs', 'main'),
          text: OLD_COMMIT,
        });

        for (const unit of units) {
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
    await withHubFixture({
      run: async (fixture) => {
        await createRepository(fixture);

        const partial = findUnitOfKind({
          findings: await loadFindings({ environment: fixture.environment }),
          kind: 'huggingFacePartialDownloads',
        });

        await updateModifiedMs({
          path: join(fixture.repoPath, 'blobs', 'stale.incomplete'),
          modifiedMs: NOW_MS,
        });

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
