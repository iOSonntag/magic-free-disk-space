import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExplorePathUnitFvmVersion } from '../../src/explore/exploreUnit.js';
import { loadFvmVersionFindings } from '../../src/explore/fvmVersions/loadFvmVersionFindings.js';
import { parseFvmrcPins } from '../../src/explore/fvmVersions/parseFvmrcPins.js';
import { recheckFvmVersionUnit } from '../../src/explore/fvmVersions/recheckFvmVersionUnit.js';
import type {
  ProjectPinFile,
  ProjectPinFileText,
} from '../../src/explore/projectPins/projectPins.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildTestPinFileText, buildTestProjectPins } from './projectPinsFixtures.js';

function buildFvmrcText(params: { text: string }): ProjectPinFileText {
  return {
    path: buildTestAbsolutePath({ text: '/Users/example/app/.fvmrc' }),
    kind: 'fvmrc',
    text: params.text,
  };
}

describeAwaitingWin32Platform('parseFvmrcPins', () => {
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

describeAwaitingWin32Platform('loadFvmVersionFindings and recheckFvmVersionUnit', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildVersionsPath(): string {
    return join(fixtureRoot.homeDir, 'fvm', 'versions');
  }

  async function writeFvmVersion(version: string): Promise<void> {
    await writeFixtureTextFile({
      path: join(buildVersionsPath(), version, 'bin', 'flutter'),
      text: '#!/bin/sh\n',
    });
  }

  function buildRun(): ExploreProbeRun {
    return {
      environment: environment,
      platform: buildTestProbePlatform(),
      processCommands: [],
      deadlineMs: Date.now() + 10_000,
      unusedCutoffMs: 0,
      staleCutoffMs: 0,
    };
  }

  function buildFvmrc(text: string): ProjectPinFile {
    return buildTestPinFileText({
      path: join(fixtureRoot.homeDir, 'code', 'app', '.fvmrc'),
      kind: 'fvmrc',
      text: text,
    });
  }

  testOnPosix('offers the versions neither global nor pinned, complete without forks', async () => {
    for (const version of ['3.10.0', '3.19.6', '3.22.0']) {
      await writeFvmVersion(version);
    }
    await symlink(join(buildVersionsPath(), '3.22.0'), join(fixtureRoot.homeDir, 'fvm', 'default'));

    const result = await loadFvmVersionFindings({
      run: buildRun(),
      projectPins: buildTestProjectPins({ files: [buildFvmrc('{"flutter": "3.19.6"}')] }),
    });

    if (result.kind === 'failed') {
      throw new Error('The FVM probe failed.');
    }

    expect(result.value.isComplete).toBe(true);
    expect(result.value.findings.map((finding) => finding.unit)).toEqual([
      {
        kind: 'fvmVersion',
        version: '3.10.0',
        folderPath: buildTestAbsolutePath({ text: join(buildVersionsPath(), '3.10.0') }),
        pinFiles: [
          {
            path: buildTestAbsolutePath({
              text: join(fixtureRoot.homeDir, 'code', 'app', '.fvmrc'),
            }),
            kind: 'fvmrc',
          },
        ],
      },
    ]);
  });

  testOnPosix('offers nothing for an unread pin and is incomplete with a fork folder', async () => {
    await writeFvmVersion('3.10.0');
    await mkdir(join(buildVersionsPath(), 'my-fork'), { recursive: true });

    expect(
      await loadFvmVersionFindings({
        run: buildRun(),
        projectPins: buildTestProjectPins({ files: [buildFvmrc('not json')] }),
      }),
    ).toEqual({ kind: 'succeeded', value: { findings: [], isComplete: false } });
  });

  testOnPosix('rechecks unchanged, busy while flutter runs, changed once pinned', async () => {
    await writeFvmVersion('3.10.0');
    const pinPath = join(fixtureRoot.homeDir, 'code', 'app', '.fvmrc');
    await writeFixtureTextFile({ path: pinPath, text: '{"flutter": "3.22.0"}' });
    const folderPath = join(buildVersionsPath(), '3.10.0');
    const unit: ExplorePathUnitFvmVersion = {
      kind: 'fvmVersion',
      version: '3.10.0',
      folderPath: buildTestAbsolutePath({ text: folderPath }),
      pinFiles: [{ path: buildTestAbsolutePath({ text: pinPath }), kind: 'fvmrc' }],
    };
    const recheck = {
      unit: unit,
      environment: environment,
      platform: buildTestProbePlatform(),
      processCommands: [],
    };

    expect(await recheckFvmVersionUnit(recheck)).toEqual({ kind: 'unchanged' });
    expect(
      await recheckFvmVersionUnit({
        ...recheck,
        processCommands: [`${folderPath}/bin/cache/dart-sdk/bin/dart run`],
      }),
    ).toEqual({ kind: 'busy' });

    await writeFixtureTextFile({ path: pinPath, text: '{"flutter": "3.10.0"}' });

    expect(await recheckFvmVersionUnit(recheck)).toEqual({ kind: 'changed' });
  });
});
