import { expect, test } from 'bun:test';
import { chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type {
  ExplorePathUnitIdeVersionFolder,
  ExploreProbeFindings,
} from '../../src/explore/exploreUnit.js';
import { loadIdeVersionFindings } from '../../src/explore/ideVersions/loadIdeVersionFindings.js';
import { recheckIdeVersionUnit } from '../../src/explore/ideVersions/recheckIdeVersionUnit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

const NOW_MS = Date.now();

const OLD_IDEA = 'IntelliJIdea2023.3';

const NEW_IDEA = 'IntelliJIdea2024.1';

const OLD_STUDIO = 'AndroidStudio2024.1';

const NEW_STUDIO = 'AndroidStudio2024.2';

type IdeFixture = {
  environment: Environment;
  libraryPath: string;
  bundlePath: string;
  ideCommand: string;
};

/** Builds a temporary home and app folder, hands them to `run`, and removes them afterwards. */
async function withIdeHome(params: { run: (fixture: IdeFixture) => Promise<void> }): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: NOW_MS });
    const bundlePath = join(fixtureRoot.applicationDir, 'IntelliJ IDEA.app');

    await params.run({
      environment: environment,
      libraryPath: join(environment.homeDir, 'Library'),
      bundlePath: bundlePath,
      ideCommand: `${bundlePath}/Contents/MacOS/idea`,
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
  const result = await loadIdeVersionFindings(
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

async function writeFile(params: { path: string }): Promise<void> {
  await writeFixtureTextFile({ path: params.path, text: 'fixture' });
}

/**
 * Two IntelliJ IDEA versions with caches, logs, and settings, the older with plugins; two Android
 * Studio versions with caches; one PyCharm version; and a JetBrains folder that is no version.
 */
async function createIdeFolders(fixture: IdeFixture): Promise<void> {
  const library = fixture.libraryPath;

  for (const version of [OLD_IDEA, NEW_IDEA]) {
    await writeFile({ path: join(library, 'Caches', 'JetBrains', version, 'index', 'data') });
    await writeFile({ path: join(library, 'Logs', 'JetBrains', version, 'idea.log') });
    await writeFile({
      path: join(library, 'Application Support', 'JetBrains', version, 'options', 'ui.xml'),
    });
  }

  await writeFile({
    path: join(library, 'Application Support', 'JetBrains', OLD_IDEA, 'plugins', 'a', 'a.jar'),
  });
  await writeFile({
    path: join(library, 'Application Support', 'JetBrains', OLD_IDEA, 'idea.vmoptions'),
  });
  await writeFile({
    path: join(library, 'Application Support', 'JetBrains', 'PyCharm2024.1', 'x'),
  });
  await writeFile({
    path: join(library, 'Application Support', 'JetBrains', 'consentOptions', 'x'),
  });

  for (const version of [OLD_STUDIO, NEW_STUDIO]) {
    await writeFile({ path: join(library, 'Caches', 'Google', version, 'data') });
  }
}

async function writeProductInfo(params: { fixture: IdeFixture; text: string }): Promise<string> {
  const path = join(params.fixture.bundlePath, 'Contents', 'Resources', 'product-info.json');

  await writeFixtureTextFile({ path: path, text: params.text });

  return path;
}

function listUnits(findings: ExploreProbeFindings): ExplorePathUnitIdeVersionFolder[] {
  return findings.findings.flatMap((finding) =>
    finding.unit.kind === 'ideVersionFolder' ? [finding.unit] : [],
  );
}

/** Each unit as `<product><version> <kind>` with its activity. */
function listActivities(findings: ExploreProbeFindings): string[] {
  return findings.findings
    .map((finding) =>
      finding.unit.kind === 'ideVersionFolder'
        ? `${finding.unit.product}${finding.unit.version} ${finding.unit.folderKind} ${finding.activity}`
        : '',
    )
    .toSorted();
}

describeAwaitingWin32Platform('loadIdeVersionFindings', () => {
  test('offers the caches, logs, plugins, and settings of each version a newer one outdates', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);

        const probed = await loadFindings({ environment: fixture.environment });

        expect(probed.isComplete).toBe(true);
        expect(
          probed.findings
            .map((finding) =>
              finding.unit.kind === 'ideVersionFolder'
                ? `${finding.unit.product}${finding.unit.version} ${finding.unit.folderKind} ${finding.risk}`
                : '',
            )
            .toSorted(),
        ).toEqual([
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

        const units = listUnits(await loadFindings({ environment: fixture.environment }));
        const settingsPath = join(
          fixture.libraryPath,
          'Application Support',
          'JetBrains',
          OLD_IDEA,
        );
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
          environment: fixture.environment,
          processCommands: [fixture.ideCommand],
        });

        expect(listActivities(busy)).toEqual([
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
          environment: fixture.environment,
          processCommands: [fixture.ideCommand],
        });

        expect(listActivities(idle).every((line) => line.endsWith(' idle'))).toBe(true);
      },
    });
  });

  test('counts a running IDE whose product-info does not parse as running every version', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await writeProductInfo({ fixture: fixture, text: '{"dataDirectoryName":' });

        const probed = await loadFindings({
          environment: fixture.environment,
          processCommands: [fixture.ideCommand],
        });

        expect(listActivities(probed).every((line) => line.endsWith(' busy'))).toBe(true);
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
            environment: fixture.environment,
            processCommands: [fixture.ideCommand],
          });

          expect(listActivities(probed).every((line) => line.endsWith(' busy'))).toBe(true);
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
          environment: fixture.environment,
          processCommands: [fixture.ideCommand],
        });
        const unknown = await loadFindings({
          environment: fixture.environment,
          processCommands: null,
        });

        expect(listActivities(idle).every((line) => line.endsWith(' idle'))).toBe(true);
        expect(listActivities(unknown).every((line) => line.endsWith(' unknown'))).toBe(true);
      },
    });
  });
});

describeAwaitingWin32Platform('recheckIdeVersionUnit', () => {
  test('is unchanged while the version is still outdated, and busy while it runs', async () => {
    await withIdeHome({
      run: async (fixture) => {
        await createIdeFolders(fixture);
        await writeProductInfo({
          fixture: fixture,
          text: JSON.stringify({ dataDirectoryName: OLD_IDEA }),
        });

        const units = listUnits(await loadFindings({ environment: fixture.environment }));

        for (const unit of units) {
          const recheck = (processCommands: string[] | null) =>
            recheckIdeVersionUnit({
              unit: unit,
              environment: fixture.environment,
              platform: buildTestProbePlatform(),
              processCommands: processCommands,
            });

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

        const units = listUnits(await loadFindings({ environment: fixture.environment }));
        const studio = units.find((unit) => unit.product === 'AndroidStudio');
        const settings = units.find((unit) => unit.folderKind === 'settings');

        if (studio === undefined || settings === undefined) {
          throw new Error('The probe did not offer the expected folders.');
        }

        await rm(join(fixture.libraryPath, 'Caches', 'Google', NEW_STUDIO), { recursive: true });
        await writeFile({
          path: join(fixture.libraryPath, 'Application Support', 'JetBrains', OLD_IDEA, 'new.xml'),
        });

        for (const unit of [studio, settings]) {
          expect(
            await recheckIdeVersionUnit({
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
});
