/** Made-up probe outputs in the formats the tools print; no value comes from a real machine. */

export const FIXTURE_HOME_DIR = '/Users/example';

export const UNAVAILABLE_DEVICE_UDID = '11111111-AAAA-4AAA-8AAA-111111111111';

export const NEVER_BOOTED_DEVICE_UDID = '22222222-BBBB-4BBB-8BBB-222222222222';

export const USED_DEVICE_UDID = '33333333-CCCC-4CCC-8CCC-333333333333';

export const BOOTED_DEVICE_UDID = '44444444-DDDD-4DDD-8DDD-444444444444';

export function buildDeviceDataPath(params: { homeDir: string; udid: string }): string {
  return `${params.homeDir}/Library/Developer/CoreSimulator/Devices/${params.udid}/data`;
}

/** Four devices: one whose runtime is gone, one never booted, one used, one booted and never shut down. */
export function buildSimulatorDeviceListJson(params: { homeDir: string }): string {
  return JSON.stringify({
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
        {
          availabilityError: 'runtime profile not found using "System" match policy',
          dataPath: buildDeviceDataPath({ homeDir: params.homeDir, udid: UNAVAILABLE_DEVICE_UDID }),
          dataPathSize: 4096,
          logPath: `${params.homeDir}/Library/Logs/CoreSimulator/${UNAVAILABLE_DEVICE_UDID}`,
          udid: UNAVAILABLE_DEVICE_UDID,
          isAvailable: false,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
          state: 'Shutdown',
          name: 'iPhone 15',
          lastBootedAt: '2025-01-02T03:04:05Z',
        },
      ],
      'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [
        {
          dataPath: buildDeviceDataPath({
            homeDir: params.homeDir,
            udid: NEVER_BOOTED_DEVICE_UDID,
          }),
          dataPathSize: 4096,
          logPath: `${params.homeDir}/Library/Logs/CoreSimulator/${NEVER_BOOTED_DEVICE_UDID}`,
          udid: NEVER_BOOTED_DEVICE_UDID,
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Air',
          state: 'Shutdown',
          name: 'iPad Air',
        },
        {
          dataPath: buildDeviceDataPath({ homeDir: params.homeDir, udid: USED_DEVICE_UDID }),
          dataPathSize: 4096,
          logPath: `${params.homeDir}/Library/Logs/CoreSimulator/${USED_DEVICE_UDID}`,
          udid: USED_DEVICE_UDID,
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17',
          state: 'Shutdown',
          name: 'iPhone 17',
          lastBootedAt: '2026-02-03T04:05:06Z',
        },
        {
          dataPath: buildDeviceDataPath({ homeDir: params.homeDir, udid: BOOTED_DEVICE_UDID }),
          dataPathSize: 4096,
          logPath: `${params.homeDir}/Library/Logs/CoreSimulator/${BOOTED_DEVICE_UDID}`,
          udid: BOOTED_DEVICE_UDID,
          isAvailable: false,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16',
          state: 'Booted',
          name: 'iPhone 16',
          lastBootedAt: '2026-03-04T05:06:07Z',
        },
      ],
    },
  });
}

export function buildDartGcPaths(params: { homeDir: string }): string[] {
  return [
    `${params.homeDir}/.pub-cache/hosted-hashes/pub.dev/example_a-1.0.0.sha256`,
    `${params.homeDir}/.pub-cache/hosted/pub.dev/example_a-1.0.0`,
    `${params.homeDir}/.pub-cache/hosted/pub.dev/example_b-2.1.0`,
    `${params.homeDir}/.pub-cache/hosted/pub.dev/example_c-0.3.0`,
  ];
}

export function buildDartGcDryRunText(params: { homeDir: string; gcPaths: string[] }): string {
  return `Found 2 active projects:
* ${params.homeDir}/projects/example-one
* ${params.homeDir}/projects/example-two
All other projects would need to run \`dart pub get\` again to work correctly.
Would recover 12 MB.
Would delete:
${params.gcPaths.join('\n')}
`;
}

export const DART_GC_NOTHING_UNUSED_TEXT = `Found 2 active projects:
* /Users/example/projects/example-one
* /Users/example/projects/example-two
No unused cache entries found.
`;

export function buildMiseInstallPath(params: {
  homeDir: string;
  toolName: string;
  version: string;
}): string {
  return `${params.homeDir}/.local/share/mise/installs/${params.toolName}/${params.version}`;
}

export function buildMisePrunableJson(params: { homeDir: string }): string {
  return JSON.stringify({
    node: [
      {
        version: '20.1.0',
        install_path: buildMiseInstallPath({
          homeDir: params.homeDir,
          toolName: 'node',
          version: '20.1.0',
        }),
        installed: true,
        active: false,
      },
    ],
    pnpm: [
      {
        version: '9.0.0',
        install_path: buildMiseInstallPath({
          homeDir: params.homeDir,
          toolName: 'pnpm',
          version: '9.0.0',
        }),
        installed: true,
        active: false,
      },
    ],
  });
}
