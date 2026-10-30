import { describe, expect, test } from 'bun:test';
import { buildSimulatorDeviceFindings } from '../../src/explore/simulatorDevices/buildSimulatorDeviceFindings.js';
import { parseSimulatorDeviceList } from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import {
  BOOTED_DEVICE_UDID,
  buildDeviceDataPath,
  buildSimulatorDeviceListJson,
  FIXTURE_HOME_DIR,
  NEVER_BOOTED_DEVICE_UDID,
  UNAVAILABLE_DEVICE_UDID,
} from './probeOutputFixtures.js';

const tool: LocatedTool = { name: 'xcrun', path: '/usr/bin/xcrun' };

function parseFixtureDevices() {
  const parsed = parseSimulatorDeviceList({
    stdoutText: buildSimulatorDeviceListJson({ homeDir: FIXTURE_HOME_DIR }),
  });

  if (parsed.kind === 'failed') {
    throw new Error(`The fixture did not parse: ${parsed.failure}`);
  }

  return parsed.value;
}

describe('parseSimulatorDeviceList', () => {
  test('reads each device with its runtime', () => {
    const devices = parseFixtureDevices();

    expect(devices).toHaveLength(4);
    expect(devices[0]).toEqual({
      udid: UNAVAILABLE_DEVICE_UDID,
      name: 'iPhone 15',
      runtimeId: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
      state: 'Shutdown',
      isAvailable: false,
      availabilityError: 'runtime profile not found using "System" match policy',
      dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: UNAVAILABLE_DEVICE_UDID }),
      lastBootedAt: '2025-01-02T03:04:05Z',
    });
    expect(devices[1]?.lastBootedAt).toBeNull();
    expect(devices[1]?.availabilityError).toBeNull();
  });

  test('rejects text that is no JSON', () => {
    expect(parseSimulatorDeviceList({ stdoutText: 'garbage' }).kind).toBe('failed');
  });

  test('rejects JSON without a devices object', () => {
    expect(parseSimulatorDeviceList({ stdoutText: '{"runtimes":[]}' }).kind).toBe('failed');
  });

  test('rejects a device whose UDID could start an option', () => {
    const text = JSON.stringify({
      devices: {
        runtime: [
          {
            udid: '--all',
            name: 'x',
            state: 'Shutdown',
            isAvailable: false,
            dataPath: '/Users/example/data',
          },
        ],
      },
    });

    expect(parseSimulatorDeviceList({ stdoutText: text }).kind).toBe('failed');
  });

  test('rejects a relative data path', () => {
    const text = JSON.stringify({
      devices: {
        runtime: [
          {
            udid: UNAVAILABLE_DEVICE_UDID,
            name: 'x',
            state: 'Shutdown',
            isAvailable: false,
            dataPath: 'data',
          },
        ],
      },
    });

    expect(parseSimulatorDeviceList({ stdoutText: text }).kind).toBe('failed');
  });
});

describe('buildSimulatorDeviceFindings', () => {
  test('offers the unavailable, the never-booted, and the booted unavailable device, not the used one', () => {
    const findings = buildSimulatorDeviceFindings({
      tool: tool,
      devices: parseFixtureDevices(),
      processCommands: [],
    });

    expect(findings.map((finding) => finding.unit)).toEqual([
      {
        kind: 'simulatorDevice',
        tool: tool,
        udid: UNAVAILABLE_DEVICE_UDID,
        dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: UNAVAILABLE_DEVICE_UDID }),
      },
      {
        kind: 'simulatorDevice',
        tool: tool,
        udid: NEVER_BOOTED_DEVICE_UDID,
        dataPath: buildDeviceDataPath({
          homeDir: FIXTURE_HOME_DIR,
          udid: NEVER_BOOTED_DEVICE_UDID,
        }),
      },
      {
        kind: 'simulatorDevice',
        tool: tool,
        udid: BOOTED_DEVICE_UDID,
        dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: BOOTED_DEVICE_UDID }),
      },
    ]);
    expect(findings.map((finding) => finding.activity)).toEqual(['idle', 'idle', 'busy']);
  });

  test('names the reason, the risk, and the device folder', () => {
    const [unavailable, neverBooted] = buildSimulatorDeviceFindings({
      tool: tool,
      devices: parseFixtureDevices(),
      processCommands: [],
    });

    expect(unavailable?.title).toBe('Simulator iPhone 15 (iOS 17.0)');
    expect(unavailable?.risk).toBe('review');
    expect(unavailable?.displayPath).toBe(
      `${FIXTURE_HOME_DIR}/Library/Developer/CoreSimulator/Devices/${UNAVAILABLE_DEVICE_UDID}`,
    );
    expect(unavailable?.evidenceLines).toEqual([
      'Its runtime com.apple.CoreSimulator.SimRuntime.iOS-17-0 is no longer installed.',
      'Simulator reports: runtime profile not found using "System" match policy',
    ]);
    expect(neverBooted?.evidenceLines).toEqual(['Simulator lists it as never booted.']);
  });

  test('leaves each idle device unknown when the processes could not be read', () => {
    const findings = buildSimulatorDeviceFindings({
      tool: tool,
      devices: parseFixtureDevices(),
      processCommands: null,
    });

    expect(findings.map((finding) => finding.activity)).toEqual(['unknown', 'unknown', 'busy']);
  });
});
