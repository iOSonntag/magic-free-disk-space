import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreToolUnitVagrantBoxVersion } from '../../src/explore/exploreUnit.js';
import { recheckExploreUnit } from '../../src/explore/recheckExploreUnit.js';
import { buildVagrantBoxFindings } from '../../src/explore/vagrantBoxes/buildVagrantBoxFindings.js';
import { loadVagrantBoxFindings } from '../../src/explore/vagrantBoxes/loadVagrantBoxFindings.js';
import type { VagrantBox } from '../../src/explore/vagrantBoxes/parseVagrantBoxList.js';
import { parseVagrantBoxList } from '../../src/explore/vagrantBoxes/parseVagrantBoxList.js';
import { compareVagrantBoxVersion } from '../../src/explore/vagrantBoxes/recheckVagrantBoxUnit.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';

/** Made-up `vagrant box list --machine-readable` output; no line comes from a real machine. */
const BOX_LIST_TEXT = [
  '1730000000,,ui,info,hashicorp/bionic64 (virtualbox%!(VAGRANT_COMMA) 1.0.0)',
  '1730000000,,box-name,hashicorp/bionic64',
  '1730000000,,box-provider,virtualbox',
  '1730000000,,box-version,1.0.0',
  '1730000000,,box-architecture,n/a',
  '1730000000,,box-info,url,https://example.com/box',
  '1730000000,,box-name,hashicorp/bionic64',
  '1730000000,,box-provider,virtualbox',
  '1730000000,,box-version,1.1.0',
  '1730000000,,box-architecture,n/a',
  '1730000000,,box-name,example/arm',
  '1730000000,,box-provider,parallels',
  '1730000000,,box-version,1.0',
  '1730000000,,box-architecture,arm64',
  '1730000000,,box-name,example/arm',
  '1730000000,,box-provider,parallels',
  '1730000000,,box-version,2.0',
  '1730000000,,box-architecture,arm64',
  '1730000000,,box-name,example/multi',
  '1730000000,,box-provider,qemu',
  '1730000000,,box-version,2.0',
  '1730000000,,box-architecture,amd64',
  '1730000000,,box-name,example/multi',
  '1730000000,,box-provider,qemu',
  '1730000000,,box-version,2.0',
  '1730000000,,box-architecture,arm64',
  '1730000000,,box-name,example/multi',
  '1730000000,,box-provider,qemu',
  '1730000000,,box-version,3.0',
  '1730000000,,box-architecture,arm64',
  '1730000000,,box-name,-evil',
  '1730000000,,box-provider,virtualbox',
  '1730000000,,box-version,1.0',
  '1730000000,,box-name,-evil',
  '1730000000,,box-provider,virtualbox',
  '1730000000,,box-version,2.0',
  '',
].join('\n');

const HOME_DIR = buildTestAbsolutePath({ text: '/Users/example' });

const FAKE_TOOL: LocatedTool = { name: 'vagrant', path: '/opt/vagrant/bin/vagrant' };

const VAGRANT_RUNNING = ['/opt/vagrant/embedded/bin/ruby /opt/vagrant/bin/vagrant up'];

const TIMEOUT_MS = 20_000;

function parseBoxes(text: string): VagrantBox[] {
  const boxes = parseVagrantBoxList({ stdoutText: text });

  if (boxes.kind === 'failed') {
    throw new Error(`The test list does not parse: ${boxes.failure}`);
  }

  return boxes.value;
}

function buildOutdatedUnit(params: {
  tool: LocatedTool;
  homeDir: string;
}): ExploreToolUnitVagrantBoxVersion {
  const [unit] = buildVagrantBoxFindings({
    tool: params.tool,
    boxes: parseBoxes(BOX_LIST_TEXT),
    pathRules: DARWIN_PATH_RULES,
    homeDir: buildTestAbsolutePath({ text: params.homeDir }),
    processCommands: [],
  }).map((finding) => finding.unit);

  if (unit === undefined || unit.kind !== 'vagrantBoxVersion') {
    throw new Error('The test list has no outdated box');
  }

  return unit;
}

describe('parseVagrantBoxList', () => {
  test('reads each box and its architecture, and leaves out a name that reads as an option', () => {
    expect<(string | null)[][]>(
      parseBoxes(BOX_LIST_TEXT).map((box) => [
        box.name,
        box.provider,
        box.version,
        box.architecture,
      ]),
    ).toEqual([
      ['hashicorp/bionic64', 'virtualbox', '1.0.0', null],
      ['hashicorp/bionic64', 'virtualbox', '1.1.0', null],
      ['example/arm', 'parallels', '1.0', 'arm64'],
      ['example/arm', 'parallels', '2.0', 'arm64'],
      ['example/multi', 'qemu', '2.0', 'amd64'],
      ['example/multi', 'qemu', '2.0', 'arm64'],
      ['example/multi', 'qemu', '3.0', 'arm64'],
    ]);
  });

  test('reads a list without boxes, or without architectures, as Vagrant before 2.4 gives it', () => {
    expect(parseBoxes('1730000000,,ui,warn,There are no installed boxes!\n')).toEqual([]);
    expect<unknown>(
      parseBoxes(
        '1730000000,,box-name,example/old\n1730000000,,box-provider,virtualbox\n1730000000,,box-version,1.0\n',
      ),
    ).toEqual([
      { name: 'example/old', provider: 'virtualbox', version: '1.0', architecture: null },
    ]);
  });

  test('fails for a field before its box name, and for a box without its version', () => {
    expect(parseVagrantBoxList({ stdoutText: '1730000000,,box-provider,virtualbox\n' }).kind).toBe(
      'failed',
    );
    expect(
      parseVagrantBoxList({
        stdoutText: '1730000000,,box-name,example/old\n1730000000,,box-provider,virtualbox\n',
      }).kind,
    ).toBe('failed');
  });
});

describe('buildVagrantBoxFindings', () => {
  test('offers each version a newer one of its name, provider and architecture outdates', () => {
    const findings = buildVagrantBoxFindings({
      tool: FAKE_TOOL,
      boxes: parseBoxes(BOX_LIST_TEXT),
      pathRules: DARWIN_PATH_RULES,
      homeDir: HOME_DIR,
      processCommands: [],
    });

    expect(findings).toEqual([
      {
        unit: {
          kind: 'vagrantBoxVersion',
          tool: FAKE_TOOL,
          name: 'hashicorp/bionic64',
          provider: 'virtualbox',
          version: '1.0.0',
          versionPath:
            '/Users/example/.vagrant.d/boxes/hashicorp-VAGRANTSLASH-bionic64/1.0.0/virtualbox',
        },
        title: 'Vagrant box hashicorp/bionic64 1.0.0 (virtualbox)',
        explanation: 'An older version of a Vagrant box, outdated by version 1.1.0.',
        regeneration: 'A Vagrantfile that asks for this version downloads it again.',
        risk: 'review',
        evidenceLines: ['Version 1.1.0 of the same box is installed.'],
        displayPath:
          '/Users/example/.vagrant.d/boxes/hashicorp-VAGRANTSLASH-bionic64/1.0.0/virtualbox',
        activity: 'idle',
      },
      expect.objectContaining({
        unit: expect.objectContaining({
          name: 'example/arm',
          version: '1.0',
          versionPath:
            '/Users/example/.vagrant.d/boxes/example-VAGRANTSLASH-arm/1.0/arm64/parallels',
        }),
      }),
    ]);
  });

  test('is busy while vagrant runs', () => {
    const findings = buildVagrantBoxFindings({
      tool: FAKE_TOOL,
      boxes: parseBoxes(BOX_LIST_TEXT),
      pathRules: DARWIN_PATH_RULES,
      homeDir: HOME_DIR,
      processCommands: VAGRANT_RUNNING,
    });

    expect(findings.map((finding) => finding.activity)).toEqual(['busy', 'busy']);
  });
});

describe('compareVagrantBoxVersion', () => {
  const unit = buildOutdatedUnit({ tool: FAKE_TOOL, homeDir: HOME_DIR });

  test('is unchanged while a newer version still outdates it, busy while vagrant runs', () => {
    const boxes = parseBoxes(BOX_LIST_TEXT);
    const compare = (processCommands: string[]) =>
      compareVagrantBoxVersion({
        unit: unit,
        boxes: boxes,
        pathRules: DARWIN_PATH_RULES,
        homeDir: HOME_DIR,
        processCommands: processCommands,
      });

    expect(compare([])).toEqual({ kind: 'unchanged' });
    expect(compare(VAGRANT_RUNNING)).toEqual({ kind: 'busy' });
  });

  test('changed once the newer version is gone, or the version itself', () => {
    const boxes = parseBoxes(BOX_LIST_TEXT);
    const lists = [
      boxes.filter((box) => box.version !== '1.1.0'),
      boxes.filter((box) => box.version !== '1.0.0'),
    ];

    for (const list of lists) {
      expect(
        compareVagrantBoxVersion({
          unit: unit,
          boxes: list,
          pathRules: DARWIN_PATH_RULES,
          homeDir: HOME_DIR,
          processCommands: [],
        }),
      ).toEqual({ kind: 'changed' });
    }
  });
});

describeAwaitingWin32Platform('the Vagrant box probe with a fake vagrant', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createFakeVagrant(params: { exitCode: number }): Promise<LocatedTool> {
    const path = await createFakeTool({
      folder: join(fixtureRoot.rootDir, 'tools'),
      name: 'vagrant',
      body: `import * as fs from 'node:fs';

if (process.argv.slice(2).join(' ') === 'box list --machine-readable') {
  fs.writeSync(1, ${JSON.stringify(BOX_LIST_TEXT)});
  process.exit(${params.exitCode});
}

process.exit(64);`,
    });

    return { name: 'vagrant', path: await realpath(path) };
  }

  test('lists the boxes with the machine-readable list and offers the outdated versions', async () => {
    const tool = await createFakeVagrant({ exitCode: 0 });
    const findings = await loadVagrantBoxFindings({
      environment: environment,
      platform: buildTestProbePlatform(),
      processCommands: [],
      deadlineMs: Date.now() + TIMEOUT_MS,
      unusedCutoffMs: 0,
      staleCutoffMs: 0,
      tool: tool,
    });

    expect(findings.kind).toBe('succeeded');
    expect(
      findings.kind === 'succeeded' ? findings.value.findings.map((finding) => finding.unit) : [],
    ).toEqual([
      buildOutdatedUnit({ tool: tool, homeDir: environment.homeDir }),
      expect.objectContaining({ name: 'example/arm', version: '1.0' }),
    ]);
  });

  test('rechecks a unit by listing the boxes again', async () => {
    const tool = await createFakeVagrant({ exitCode: 0 });

    expect(
      await recheckExploreUnit({
        unit: buildOutdatedUnit({ tool: tool, homeDir: environment.homeDir }),
        tool: tool,
        environment: environment,
        platform: buildTestProbePlatform(),
        processCommands: [],
        timeoutMs: TIMEOUT_MS,
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('fails when vagrant exits with an error', async () => {
    const tool = await createFakeVagrant({ exitCode: 1 });
    const findings = await loadVagrantBoxFindings({
      environment: environment,
      platform: buildTestProbePlatform(),
      processCommands: [],
      deadlineMs: Date.now() + TIMEOUT_MS,
      unusedCutoffMs: 0,
      staleCutoffMs: 0,
      tool: tool,
    });

    expect(findings).toEqual({
      kind: 'failed',
      failure: {
        reason: 'commandFailed',
        failure: expect.objectContaining({ reason: 'exitedWithError' }),
      },
    });
  });
});
