import { describe, expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { Environment, EnvironmentFolders } from '../../src/environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../../src/environment/environmentLocation.js';
import type { PathUnitRecheck } from '../../src/explore/decideComparisonActivity.js';
import type { IdeVersionRoots } from '../../src/explore/explorePlatform.js';
import type {
  ExploreFoundPaths,
  ExplorePathUnitIdeVersionFolder,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { compareIdeVersionUnit } from '../../src/explore/ideVersions/compareIdeVersionUnit.js';
import { decideIdeVersionOffers } from '../../src/explore/ideVersions/decideIdeVersionOffers.js';
import { loadIdeVersionFindings } from '../../src/explore/ideVersions/loadIdeVersionFindings.js';
import type { IdeVersionFolder } from '../../src/explore/ideVersions/loadIdeVersionState.js';
import { recheckIdeVersionUnit } from '../../src/explore/ideVersions/recheckIdeVersionUnit.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { createFixtureDirectory, writeFixtureTextFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';

const NOW_MS = Date.now();

const OLD_IDEA = 'IntelliJIdea2023.3';

const NEW_IDEA = 'IntelliJIdea2024.1';

const OLD_STUDIO = 'AndroidStudio2024.1';

const NEW_STUDIO = 'AndroidStudio2024.2';

const VALUE_LIBRARY_PATH = '/Users/example/Library';

/** Whether the host's catalog names any folder of IDE versions. */
const hasIdeVersionRoots = Object.values(hostPlatform.explore.ideVersionRoots).some(
  (roots) => roots.length > 0,
);

/**
 * A temporary home with the roots of IDE versions it fills, where the host's catalog keeps them.
 */
type IdeFixture = {
  environment: Environment;
  jetBrainsCachesPath: AbsolutePath;
  jetBrainsLogsPath: AbsolutePath;
  jetBrainsSettingsPath: AbsolutePath;
  googleCachesPath: AbsolutePath;
  bundlePath: string;
  ideCommand: string;
};

/** The root of the IDE versions of `kind` the host's catalog keeps for the IDEs of `vendor`. */
function buildIdeVersionRootPath(params: {
  environment: EnvironmentFolders;
  kind: keyof IdeVersionRoots;
  vendor: 'JetBrains' | 'Google';
}): AbsolutePath {
  const root = hostPlatform.explore.ideVersionRoots[params.kind].find((location) =>
    location.path.endsWith(`/${params.vendor}`),
  );

  if (root === undefined) {
    throw new Error(`The platform has no ${params.kind} folder of ${params.vendor}.`);
  }

  return resolveEnvironmentLocation({ folders: params.environment, location: root });
}

/** Builds a temporary home and app folder, hands them to `run`, and removes them afterwards. */
async function withIdeHome(params: { run: (fixture: IdeFixture) => Promise<void> }): Promise<void> {
  await withFixtureHome({
    nowMs: NOW_MS,
    run: async (home) => {
      const bundlePath = join(home.fixtureRoot.applicationDir, 'IntelliJ IDEA.app');

      await params.run({
        environment: home.environment,
        jetBrainsCachesPath: buildIdeVersionRootPath({
          environment: home.environment,
          kind: 'caches',
          vendor: 'JetBrains',
        }),
        jetBrainsLogsPath: buildIdeVersionRootPath({
          environment: home.environment,
          kind: 'logs',
          vendor: 'JetBrains',
        }),
        jetBrainsSettingsPath: buildIdeVersionRootPath({
          environment: home.environment,
          kind: 'settings',
          vendor: 'JetBrains',
        }),
        googleCachesPath: buildIdeVersionRootPath({
          environment: home.environment,
          kind: 'caches',
          vendor: 'Google',
        }),
        bundlePath: bundlePath,
        ideCommand: `${bundlePath}/Contents/MacOS/idea`,
      });
    },
  });
}

async function loadFindings(params: {
  fixture: IdeFixture;
  commandLines: string[] | null;
}): Promise<ExploreProbeFindings> {
  return getProbeFindings(
    await loadIdeVersionFindings(
      buildTestProbeRun({
        environment: params.fixture.environment,
        runningProcesses: buildRunningCommandLines(params.commandLines),
      }),
    ),
  );
}

async function writeFile(params: { path: string }): Promise<void> {
  await writeFixtureTextFile({ path: params.path, text: 'fixture' });
}

function buildValuePath(...names: string[]): AbsolutePath {
  return buildTestAbsolutePath({ text: posix.join(VALUE_LIBRARY_PATH, ...names) });
}

/**
 * Two IntelliJ IDEA versions with caches, logs, and settings, the older with plugins; two Android
 * Studio versions with caches; one PyCharm version; and a JetBrains folder that is no version.
 */
async function createIdeFolders(fixture: IdeFixture): Promise<void> {
  for (const version of [OLD_IDEA, NEW_IDEA]) {
    await writeFile({ path: join(fixture.jetBrainsCachesPath, version, 'index', 'data') });
    await writeFile({ path: join(fixture.jetBrainsLogsPath, version, 'idea.log') });
    await writeFile({ path: join(fixture.jetBrainsSettingsPath, version, 'options', 'ui.xml') });
  }

  await writeFile({ path: join(fixture.jetBrainsSettingsPath, OLD_IDEA, 'plugins', 'a', 'a.jar') });
  await writeFile({ path: join(fixture.jetBrainsSettingsPath, OLD_IDEA, 'idea.vmoptions') });
  await writeFile({ path: join(fixture.jetBrainsSettingsPath, 'PyCharm2024.1', 'x') });
  await writeFile({ path: join(fixture.jetBrainsSettingsPath, 'consentOptions', 'x') });

  for (const version of [OLD_STUDIO, NEW_STUDIO]) {
    await writeFile({ path: join(fixture.googleCachesPath, version, 'data') });
  }
}

async function writeProductInfo(params: { fixture: IdeFixture; text: string }): Promise<string> {
  const path = join(params.fixture.bundlePath, 'Contents', 'Resources', 'product-info.json');

  await writeFixtureTextFile({ path: path, text: params.text });

  return path;
}

/** Each unit as `<product><version> <kind>` with its risk or its activity, sorted. */
function listFolderLines(params: {
  findings: ExploreProbeFindings;
  field: 'risk' | 'activity';
}): string[] {
  return params.findings.findings
    .map((finding) =>
      finding.unit.kind === 'ideVersionFolder'
        ? `${finding.unit.product}${finding.unit.version} ${finding.unit.folderKind} ${finding[params.field]}`
        : '',
    )
    .toSorted();
}

describe('decideIdeVersionOffers', () => {
  test('offers each folder of a version older than the newest of its product in any root', () => {
    const oldCachesPath = buildValuePath('Caches', 'JetBrains', 'IntelliJIdea2023.3');

    expect(
      decideIdeVersionOffers({
        folders: [
          { kind: 'caches', product: 'IntelliJIdea', version: '2023.3', path: oldCachesPath },
          {
            kind: 'logs',
            product: 'IntelliJIdea',
            version: '2023.10',
            path: buildValuePath('Logs', 'JetBrains', 'IntelliJIdea2023.10'),
          },
          {
            kind: 'caches',
            product: 'PyCharm',
            version: '2022.1',
            path: buildValuePath('Caches', 'JetBrains', 'PyCharm2022.1'),
          },
        ],
      }),
    ).toEqual([
      {
        product: 'IntelliJIdea',
        version: '2023.3',
        newestVersion: '2023.10',
        folderKind: 'caches',
        folderPath: oldCachesPath,
        foundPaths: [oldCachesPath],
      },
    ]);
  });

  test("splits an old version's settings into its plugins and its other entries", () => {
    const settingsPath = buildValuePath('Application Support', 'JetBrains', 'IntelliJIdea2023.3');
    const pluginsPath = buildValuePath(
      'Application Support',
      'JetBrains',
      'IntelliJIdea2023.3',
      'plugins',
    );
    const otherPaths: ExploreFoundPaths = [
      buildValuePath('Application Support', 'JetBrains', 'IntelliJIdea2023.3', 'options'),
      buildValuePath('Application Support', 'JetBrains', 'IntelliJIdea2023.3', 'idea.vmoptions'),
    ];

    expect(
      decideIdeVersionOffers({
        folders: [
          {
            kind: 'settings',
            product: 'IntelliJIdea',
            version: '2023.3',
            path: settingsPath,
            pluginsPath: pluginsPath,
            otherPaths: otherPaths,
          },
          {
            kind: 'settings',
            product: 'IntelliJIdea',
            version: '2024.1',
            path: buildValuePath('Application Support', 'JetBrains', 'IntelliJIdea2024.1'),
            pluginsPath: null,
            otherPaths: [],
          },
        ],
      }).map((offer) => [offer.folderKind, offer.folderPath, offer.foundPaths]),
    ).toEqual([
      ['plugins', settingsPath, [pluginsPath]],
      ['settings', settingsPath, otherPaths],
    ]);
  });

  test('offers nothing of an old settings folder without plugins or other entries', () => {
    expect(
      decideIdeVersionOffers({
        folders: [
          {
            kind: 'settings',
            product: 'IntelliJIdea',
            version: '2023.3',
            path: buildValuePath('Application Support', 'JetBrains', 'IntelliJIdea2023.3'),
            pluginsPath: null,
            otherPaths: [],
          },
          {
            kind: 'caches',
            product: 'IntelliJIdea',
            version: '2024.1',
            path: buildValuePath('Caches', 'JetBrains', 'IntelliJIdea2024.1'),
          },
        ],
      }),
    ).toEqual([]);
  });
});

describe('compareIdeVersionUnit', () => {
  const oldCachesPath = buildValuePath('Caches', 'JetBrains', OLD_IDEA);
  const unit: ExplorePathUnitIdeVersionFolder = {
    kind: 'ideVersionFolder',
    product: 'IntelliJIdea',
    version: '2023.3',
    folderKind: 'caches',
    folderPath: oldCachesPath,
    foundPaths: [oldCachesPath],
  };
  const folders: IdeVersionFolder[] = [
    { kind: 'caches', product: 'IntelliJIdea', version: '2023.3', path: oldCachesPath },
    {
      kind: 'caches',
      product: 'IntelliJIdea',
      version: '2024.1',
      path: buildValuePath('Caches', 'JetBrains', NEW_IDEA),
    },
  ];
  const bundlePath = '/Applications/IntelliJ IDEA.app';
  const ideCommand = `${bundlePath}/Contents/MacOS/idea`;

  test('is unchanged while a newer version still outdates the folder and no IDE of it runs', () => {
    expect(
      compareIdeVersionUnit({
        unit: unit,
        folders: folders,
        runningIdes: [{ bundlePath: bundlePath, dataDirectoryName: NEW_IDEA }],
        runningProcesses: buildRunningCommandLines([ideCommand]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is busy while an IDE of its version runs, or the processes are unknown', () => {
    expect(
      compareIdeVersionUnit({
        unit: unit,
        folders: folders,
        runningIdes: [{ bundlePath: bundlePath, dataDirectoryName: OLD_IDEA }],
        runningProcesses: buildRunningCommandLines([ideCommand]),
      }),
    ).toEqual({ kind: 'busy' });
    expect(
      compareIdeVersionUnit({
        unit: unit,
        folders: folders,
        runningIdes: [],
        runningProcesses: null,
      }),
    ).toEqual({ kind: 'busy' });
  });

  test('is changed once no newer version outdates it, or its paths differ', () => {
    expect(
      compareIdeVersionUnit({
        unit: unit,
        folders: folders.slice(0, 1),
        runningIdes: [],
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
    expect(
      compareIdeVersionUnit({
        unit: { ...unit, foundPaths: [oldCachesPath, buildValuePath('Caches', 'other')] },
        folders: folders,
        runningIdes: [],
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });
});

describe.skipIf(!hasIdeVersionRoots)('loadIdeVersionFindings', () => {
  test('offers the caches, logs, plugins, and settings of each version a newer one outdates', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);

        const probed = await loadFindings({ fixture: fixture, commandLines: [] });

        expect(probed.isComplete).toBe(true);
        expect(listFolderLines({ findings: probed, field: 'risk' })).toEqual([
          `${OLD_STUDIO} caches safe`,
          `${OLD_IDEA} caches safe`,
          `${OLD_IDEA} logs safe`,
          `${OLD_IDEA} plugins review`,
          `${OLD_IDEA} settings careful`,
        ]);
      },
    });
  });

  test('keeps the plugins and the other settings of a version apart, never its settings folder', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);

        const units = listUnitsOfKind({
          findings: await loadFindings({ fixture: fixture, commandLines: [] }),
          kind: 'ideVersionFolder',
        });
        const settingsPath = join(fixture.jetBrainsSettingsPath, OLD_IDEA);
        const plugins = units.find((unit) => unit.folderKind === 'plugins');
        const settings = units.find((unit) => unit.folderKind === 'settings');

        expect<string[]>([...(plugins?.foundPaths ?? [])]).toEqual([join(settingsPath, 'plugins')]);
        expect<string[]>([...(settings?.foundPaths ?? [])].toSorted()).toEqual([
          join(settingsPath, 'idea.vmoptions'),
          join(settingsPath, 'options'),
        ]);
        expect<string | undefined>(plugins?.folderPath).toBe(settingsPath);
        expect<string | undefined>(settings?.folderPath).toBe(settingsPath);
      },
    });
  });

  test("marks busy only the version whose dataDirectoryName a running IDE's product-info names", async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await writeProductInfo({
          fixture: fixture,
          text: JSON.stringify({ name: 'IntelliJ IDEA', dataDirectoryName: OLD_IDEA }),
        });

        const busy = await loadFindings({
          fixture: fixture,
          commandLines: [fixture.ideCommand],
        });

        expect(listFolderLines({ findings: busy, field: 'activity' })).toEqual([
          `${OLD_STUDIO} caches idle`,
          `${OLD_IDEA} caches busy`,
          `${OLD_IDEA} logs busy`,
          `${OLD_IDEA} plugins busy`,
          `${OLD_IDEA} settings busy`,
        ]);

        await writeProductInfo({
          fixture: fixture,
          text: JSON.stringify({ name: 'IntelliJ IDEA', dataDirectoryName: NEW_IDEA }),
        });

        const idle = await loadFindings({
          fixture: fixture,
          commandLines: [fixture.ideCommand],
        });

        expect(
          listFolderLines({ findings: idle, field: 'activity' }).every((line) =>
            line.endsWith(' idle'),
          ),
        ).toBe(true);
      },
    });
  });

  test('counts a running IDE whose product-info does not parse as running every version', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await writeProductInfo({ fixture: fixture, text: '{"dataDirectoryName":' });

        const probed = await loadFindings({
          fixture: fixture,
          commandLines: [fixture.ideCommand],
        });

        expect(
          listFolderLines({ findings: probed, field: 'activity' }).every((line) =>
            line.endsWith(' busy'),
          ),
        ).toBe(true);
      },
    });
  });

  testOnPosix(
    'counts a running IDE whose product-info cannot be read as running every version',
    async () => {
      await withIdeHome({
        run: async (fixture) => {
          await createIdeFolders(fixture);

          const productInfoPath = await writeProductInfo({
            fixture: fixture,
            text: JSON.stringify({ dataDirectoryName: NEW_IDEA }),
          });

          await chmod(productInfoPath, 0o000);

          const probed = await loadFindings({
            fixture: fixture,
            commandLines: [fixture.ideCommand],
          });

          expect(
            listFolderLines({ findings: probed, field: 'activity' }).every((line) =>
              line.endsWith(' busy'),
            ),
          ).toBe(true);
        },
      });
    },
  );

  test('leaves every version idle beside a running app without product-info, unknown without processes', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await createFixtureDirectory({ path: join(fixture.bundlePath, 'Contents', 'MacOS') });

        const idle = await loadFindings({
          fixture: fixture,
          commandLines: [fixture.ideCommand],
        });
        const unknown = await loadFindings({ fixture: fixture, commandLines: null });

        expect(
          listFolderLines({ findings: idle, field: 'activity' }).every((line) =>
            line.endsWith(' idle'),
          ),
        ).toBe(true);
        expect(
          listFolderLines({ findings: unknown, field: 'activity' }).every((line) =>
            line.endsWith(' unknown'),
          ),
        ).toBe(true);
      },
    });
  });
});

describe.skipIf(!hasIdeVersionRoots)('recheckIdeVersionUnit', () => {
  test('is unchanged while the version is still outdated, and busy while it runs', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await writeProductInfo({
          fixture: fixture,
          text: JSON.stringify({ dataDirectoryName: OLD_IDEA }),
        });

        const units = listUnitsOfKind({
          findings: await loadFindings({ fixture: fixture, commandLines: [] }),
          kind: 'ideVersionFolder',
        });

        for (const unit of units) {
          function recheck(commandLines: string[] | null): Promise<PathUnitRecheck> {
            return recheckIdeVersionUnit({
              unit: unit,
              environment: fixture.environment,
              platform: buildTestProbePlatform(),
              runningProcesses: buildRunningCommandLines(commandLines),
            });
          }

          expect(await recheck([])).toEqual({ kind: 'unchanged' });
          expect(await recheck(null)).toEqual({ kind: 'busy' });
          expect(await recheck([fixture.ideCommand])).toEqual({
            kind: unit.version === '2023.3' ? 'busy' : 'unchanged',
          });
        }
      },
    });
  });

  test('is changed once the newer version is gone, or a settings file is added', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);

        const units = listUnitsOfKind({
          findings: await loadFindings({ fixture: fixture, commandLines: [] }),
          kind: 'ideVersionFolder',
        });
        const studio = units.find((unit) => unit.product === 'AndroidStudio');
        const settings = units.find((unit) => unit.folderKind === 'settings');

        if (studio === undefined || settings === undefined) {
          throw new Error('The probe did not offer the expected folders.');
        }

        await rm(join(fixture.googleCachesPath, NEW_STUDIO), { recursive: true });
        await writeFile({ path: join(fixture.jetBrainsSettingsPath, OLD_IDEA, 'new.xml') });

        for (const unit of [studio, settings]) {
          expect(
            await recheckIdeVersionUnit({
              unit: unit,
              environment: fixture.environment,
              platform: buildTestProbePlatform(),
              runningProcesses: buildRunningCommandLines([]),
            }),
          ).toEqual({ kind: 'changed' });
        }
      },
    });
  });
});
