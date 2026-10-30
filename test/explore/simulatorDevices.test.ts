import { describe, expect, test } from 'bun:test';
import { buildSimulatorDeviceFindings } from '../../src/explore/simulatorDevices/buildSimulatorDeviceFindings.js';
import {
  parseSimulatorDeviceList,
  parseSimulatorDeviceUdid,
} from '../../src/explore/simulatorDevices/parseSimulatorDeviceList.js';
import { parseAbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import {
  AVAILABLE_UNDATED_DEVICE_UDID,
  BOOTED_DEVICE_UDID,
  buildDeviceDataPath,
  buildSimulatorDeviceListJson,
  FIXTURE_HOME_DIR,
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

describe('parseSimulatorDeviceUdid', () => {
  test('passes a UUID in either case', () => {
    expect(parseSimulatorDeviceUdid({ text: '11111111-aaaa-4aaa-8aaa-111111111111' }).kind).toBe(
      'succeeded',
    );
    expect(parseSimulatorDeviceUdid({ text: UNAVAILABLE_DEVICE_UDID })).toEqual({
      kind: 'succeeded',
      value: UNAVAILABLE_DEVICE_UDID,
    });
  });

  test('rejects any other text', () => {
    expect(parseSimulatorDeviceUdid({ text: '--all' }).kind).toBe('failed');
    expect(parseSimulatorDeviceUdid({ text: `${UNAVAILABLE_DEVICE_UDID} ` }).kind).toBe('failed');
  });
});

describe('parseAbsolutePath', () => {
  test('passes an absolute path and rejects a relative one', () => {
    expect(parseAbsolutePath({ text: '/Users/example/data' }).kind).toBe('succeeded');
    expect(parseAbsolutePath({ text: 'data' }).kind).toBe('failed');
    expect(parseAbsolutePath({ text: '-rf' }).kind).toBe('failed');
  });
});

describe('parseSimulatorDeviceList', () => {
  test('reads each device with its runtime', () => {
    const devices = parseFixtureDevices();

    expect(devices).toHaveLength(4);
    expect(devices[0]).toEqual({
      udid: UNAVAILABLE_DEVICE_UDID,
      name: 'iPhone 15',
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
      state: 'Shutdown',
      isAvailable: false,
      availabilityError: 'runtime profile not found using "System" match policy',
      dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: UNAVAILABLE_DEVICE_UDID }),
    });
    expect(devices[1]?.udid).toBe(AVAILABLE_UNDATED_DEVICE_UDID);
    expect(devices[1]?.availabilityError).toBeNull();
  });

  test('ignores lastBootedAt, whatever its value', () => {
    for (const lastBootedAt of [null, 42, '2025-01-02T03:04:05Z']) {
      const text = JSON.stringify({
        devices: {
          runtime: [
            {
              udid: UNAVAILABLE_DEVICE_UDID,
              name: 'x',
              state: 'Shutdown',
              isAvailable: false,
              dataPath: '/Users/example/data',
              lastBootedAt: lastBootedAt,
            },
          ],
        },
      });

      expect(parseSimulatorDeviceList({ stdoutText: text }).kind).toBe('succeeded');
    }
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
  test('offers the unavailable and the booted unavailable device, no available one', () => {
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
        udid: BOOTED_DEVICE_UDID,
        dataPath: buildDeviceDataPath({ homeDir: FIXTURE_HOME_DIR, udid: BOOTED_DEVICE_UDID }),
      },
    ]);
    expect(findings.map((finding) => finding.activity)).toEqual(['idle', 'busy']);
  });

  test('offers no available, shut-down device that simctl lists without lastBootedAt', () => {
    const undatedDevices = parseFixtureDevices().filter(
      (device) => device.udid === AVAILABLE_UNDATED_DEVICE_UDID,
    );

    expect(undatedDevices).toMatchObject([{ isAvailable: true, state: 'Shutdown' }]);
    expect(
      buildSimulatorDeviceFindings({ tool: tool, devices: undatedDevices, processCommands: [] }),
    ).toEqual([]);
  });

  test('names the reason, the risk, and the device folder', () => {
    const [unavailable, booted] = buildSimulatorDeviceFindings({
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
    expect(booted?.evidenceLines).toEqual([
      'Its runtime com.apple.CoreSimulator.SimRuntime.iOS-26-0 is no longer installed.',
    ]);
  });

  test('leaves each idle device unknown when the processes could not be read', () => {
    const findings = buildSimulatorDeviceFindings({
      tool: tool,
      devices: parseFixtureDevices(),
      processCommands: null,
    });

    expect(findings.map((finding) => finding.activity)).toEqual(['unknown', 'busy']);
  });
});
