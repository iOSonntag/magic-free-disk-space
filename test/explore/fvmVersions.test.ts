import { describe, expect, test } from 'bun:test';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExplorePathUnitFvmVersion } from '../../src/explore/exploreUnit.js';
import { compareFvmVersionUnit } from '../../src/explore/fvmVersions/compareFvmVersionUnit.js';
import type { FvmState } from '../../src/explore/fvmVersions/loadFvmState.js';
import { loadFvmVersionFindings } from '../../src/explore/fvmVersions/loadFvmVersionFindings.js';
import { parseFvmrcPins } from '../../src/explore/fvmVersions/parseFvmrcPins.js';
import { recheckFvmVersionUnit } from '../../src/explore/fvmVersions/recheckFvmVersionUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileText,
} from '../../src/explore/projectPins/projectPins.js';
import type { ToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { createFixtureDirectory, writeFixtureTextFile } from '../support/fixtureRoot.js';
import { buildTestAbsolutePath, joinBelowHome } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import type { FixtureHome } from '../support/probeRunFixtures.js';
import {
  buildTestProbeRun,
  getProbeFindings,
  listUnitsOfKind,
  withFixtureHome,
} from '../support/probeRunFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import {
  buildTestPinFileText,
  buildTestPinText,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const VALUE_VERSIONS_PATH = '/Users/example/fvm/versions';

const UNPINNED: ToolPins = { kind: 'texts', files: [] };

function buildFvmrcText(params: { text: string }): ProjectPinFileText {
  return buildTestPinText({
    path: buildTestAbsolutePath({ text: '/Users/example/app/.fvmrc' }),
    kind: 'fvmrc',
    text: params.text,
  });
}

describe('parseFvmrcPins', () => {
  test('reads flutterSdkVersion before flutter, and each flavor', () => {
    expect(
      parseFvmrcPins({
        files: [
          buildFvmrcText({ text: '{"flutterSdkVersion": "3.22.0", "flutter": "3.10.0"}' }),
          buildFvmrcText({ text: '{"flutter": "stable", "flavors": {"prod": "3.19.6"}}' }),
        ],
      }),
    ).toEqual({ kind: 'versions', versions: new Set(['3.22.0', 'stable', '3.19.6']) });
  });

  test('pins every version for a file FVM would not read as a pin', () => {
    for (const text of ['not json', '[]', '{}', '{"flutter": "3.22.0", "flavors": {"a": 3}}']) {
      expect(parseFvmrcPins({ files: [buildFvmrcText({ text: text })] })).toEqual({
        kind: 'everyVersion',
      });
    }
  });
});

describe('compareFvmVersionUnit', () => {
  const unit: ExplorePathUnitFvmVersion = {
    kind: 'fvmVersion',
    version: '3.10.0',
    folderPath: buildTestAbsolutePath({ text: `${VALUE_VERSIONS_PATH}/3.10.0` }),
    pinFiles: [],
  };

  function buildValueState(params: {
    folderPath: AbsolutePath;
    globalVersion: string | null;
  }): FvmState {
    return {
      versions: [{ version: unit.version, folderPath: params.folderPath }],
      globalVersion: params.globalVersion,
      hasUnjudgedFolder: false,
    };
  }

  test('is unchanged while the version is still offered at its folder and idle', () => {
    expect(
      compareFvmVersionUnit({
        unit: unit,
        state: buildValueState({ folderPath: unit.folderPath, globalVersion: '3.22.0' }),
        toolPins: UNPINNED,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once the version is global, lies in another folder, or is pinned', () => {
    const cases: { state: FvmState; toolPins: ToolPins }[] = [
      {
        state: buildValueState({ folderPath: unit.folderPath, globalVersion: '3.10.0' }),
        toolPins: UNPINNED,
      },
      {
        state: buildValueState({
          folderPath: buildTestAbsolutePath({ text: '/opt/example/fvm/3.10.0' }),
          globalVersion: null,
        }),
        toolPins: UNPINNED,
      },
      {
        state: buildValueState({ folderPath: unit.folderPath, globalVersion: null }),
        toolPins: { kind: 'texts', files: [buildFvmrcText({ text: '{"flutter": "3.10.0"}' })] },
      },
      {
        state: buildValueState({ folderPath: unit.folderPath, globalVersion: null }),
        toolPins: { kind: 'everyVersionPinned' },
      },
    ];

    for (const entry of cases) {
      expect(
        compareFvmVersionUnit({
          unit: unit,
          state: entry.state,
          toolPins: entry.toolPins,
          runningProcesses: buildRunningCommandLines([]),
        }),
      ).toEqual({ kind: 'changed' });
    }
  });

  test('is busy while a process runs from its folder, or the processes are unknown', () => {
    for (const runningProcesses of [
      buildRunningCommandLines([`${unit.folderPath}/bin/cache/dart-sdk/bin/dart run`]),
      null,
    ]) {
      expect(
        compareFvmVersionUnit({
          unit: unit,
          state: buildValueState({ folderPath: unit.folderPath, globalVersion: null }),
          toolPins: UNPINNED,
          runningProcesses: runningProcesses,
        }),
      ).toEqual({ kind: 'busy' });
    }
  });
});

describe('loadFvmVersionFindings and recheckFvmVersionUnit', () => {
  function buildVersionsPath(home: FixtureHome): string {
    return join(home.fixtureRoot.homeDir, 'fvm', 'versions');
  }

  async function writeFvmVersion(params: { home: FixtureHome; version: string }): Promise<void> {
    await writeFixtureTextFile({
      path: join(buildVersionsPath(params.home), params.version, 'bin', 'flutter'),
      text: '#!/bin/sh\n',
    });
  }

  function buildFvmrc(params: { home: FixtureHome; text: string }): ProjectPinFile {
    return buildTestPinFileText({
      path: joinBelowHome({ home: params.home.environment, path: 'code/app/.fvmrc' }),
      kind: 'fvmrc',
      text: params.text,
    });
  }

  testOnPosix('offers the versions neither global nor pinned, complete without forks', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        for (const version of ['3.10.0', '3.19.6', '3.22.0']) {
          await writeFvmVersion({ home: home, version: version });
        }

        await symlink(
          join(buildVersionsPath(home), '3.22.0'),
          join(home.fixtureRoot.homeDir, 'fvm', 'default'),
        );

        const findings = getProbeFindings(
          await loadFvmVersionFindings({
            run: buildTestProbeRun({ environment: home.environment }),
            projectPins: buildTestProjectPins({
              files: [buildFvmrc({ home: home, text: '{"flutter": "3.19.6"}' })],
            }),
          }),
        );

        expect(findings.isComplete).toBe(true);
        expect(listUnitsOfKind({ findings: findings, kind: 'fvmVersion' })).toEqual([
          {
            kind: 'fvmVersion',
            version: '3.10.0',
            folderPath: buildTestAbsolutePath({ text: join(buildVersionsPath(home), '3.10.0') }),
            pinFiles: [
              {
                path: buildTestAbsolutePath({
                  text: join(home.fixtureRoot.homeDir, 'code', 'app', '.fvmrc'),
                }),
                kind: 'fvmrc',
              },
            ],
          },
        ]);
        expect(findings.findings[0]).toMatchObject({ risk: 'review', activity: 'idle' });
      },
    });
  });

  testOnPosix('offers nothing for an unread pin and is incomplete with a fork folder', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        await writeFvmVersion({ home: home, version: '3.10.0' });
        await createFixtureDirectory({ path: join(buildVersionsPath(home), 'my-fork') });

        expect(
          await loadFvmVersionFindings({
            run: buildTestProbeRun({ environment: home.environment }),
            projectPins: buildTestProjectPins({
              files: [buildFvmrc({ home: home, text: 'not json' })],
            }),
          }),
        ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: false } });
      },
    });
  });

  testOnPosix('rechecks unchanged, then changed once pinned', async () => {
    await withFixtureHome({
      nowMs: Date.now(),
      run: async (home) => {
        await writeFvmVersion({ home: home, version: '3.10.0' });
        const pinPath = join(home.fixtureRoot.homeDir, 'code', 'app', '.fvmrc');
        await writeFixtureTextFile({ path: pinPath, text: '{"flutter": "3.22.0"}' });
        const unit: ExplorePathUnitFvmVersion = {
          kind: 'fvmVersion',
          version: '3.10.0',
          folderPath: buildTestAbsolutePath({ text: join(buildVersionsPath(home), '3.10.0') }),
          pinFiles: [{ path: buildTestAbsolutePath({ text: pinPath }), kind: 'fvmrc' }],
        };
        const recheck = {
          unit: unit,
          environment: home.environment,
          platform: buildTestProbePlatform(),
          runningProcesses: buildRunningCommandLines([]),
        };

        expect(await recheckFvmVersionUnit(recheck)).toEqual({ kind: 'unchanged' });

        await writeFixtureTextFile({ path: pinPath, text: '{"flutter": "3.10.0"}' });

        expect(await recheckFvmVersionUnit(recheck)).toEqual({ kind: 'changed' });
      },
    });
  });
});
