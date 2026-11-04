import { describe, expect, test } from 'bun:test';
import { buildUnitRunArguments } from '../../src/explore/exploreUnit.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
} from '../support/parsedValueFixtures.js';
import {
  buildDeviceDataPath,
  FIXTURE_HOME_DIR,
  UNAVAILABLE_DEVICE_UDID,
} from './probeOutputFixtures.js';

describe('buildUnitRunArguments', () => {
  test('a dart unit runs its gc with the dart leading argument first', () => {
    expect(
      buildUnitRunArguments({
        kind: 'dartPubCache',
        tool: { name: 'dart', path: '/opt/example/dart-sdk/bin/dart' },
        gcPaths: [],
      }),
    ).toEqual(['--suppress-analytics', 'pub', 'cache', 'gc', '--force']);
  });

  test('a mise unit uninstalls its version with no leading argument', () => {
    expect(
      buildUnitRunArguments({
        kind: 'miseVersion',
        tool: { name: 'mise', path: '/opt/example/bin/mise' },
        miseToolName: buildTestMiseToolName({ text: 'node' }),
        version: buildTestMiseToolVersion({ text: '20.1.0' }),
        installPath: buildTestAbsolutePath({ text: '/opt/example/mise/installs/node/20.1.0' }),
      }),
    ).toEqual(['uninstall', 'node@20.1.0']);
  });

  test('a simulator unit deletes its device with no leading argument', () => {
    expect(
      buildUnitRunArguments({
        kind: 'simulatorDevice',
        tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
        udid: UNAVAILABLE_DEVICE_UDID,
        dataPath: buildDeviceDataPath({
          homeDir: FIXTURE_HOME_DIR,
          udid: UNAVAILABLE_DEVICE_UDID,
        }),
      }),
    ).toEqual(['simctl', 'delete', UNAVAILABLE_DEVICE_UDID]);
  });
});
