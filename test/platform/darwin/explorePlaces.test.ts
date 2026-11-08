import { describe, expect, test } from 'bun:test';
import type { Environment } from '../../../src/environment/buildEnvironment.js';
import {
  resolveEnvironmentLocation,
  resolveEnvironmentLocations,
} from '../../../src/environment/environmentLocation.js';
import type { ContainerEngine } from '../../../src/explore/explorePlatform.js';
import { formatExploreUnitKey } from '../../../src/explore/formatExploreUnitKey.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { buildVolumeName } from '../../explore/engineFixtures.js';
import { buildTestMacEnvironment } from '../../support/fixtureRoot.js';

/**
 * Every place an engine names: a fixed engine's sockets and disk image; a profile engine's
 * profiles folder, its default disk image, and the disk image of a profile `work`.
 */
function listEnginePlacePaths(params: {
  environment: Environment;
  engine: ContainerEngine | null;
}): string[] {
  if (params.engine === null) {
    return [];
  }

  switch (params.engine.kind) {
    case 'fixed':
      return resolveEnvironmentLocations({
        folders: params.environment,
        locations: [...params.engine.socketPaths, params.engine.diskImagePath],
      });
    case 'profiles':
      return resolveEnvironmentLocations({
        folders: params.environment,
        locations: [
          params.engine.profilesRoot,
          params.engine.diskImagePath,
          params.engine.buildDiskImagePath('work'),
        ],
      });
  }
}

// The paths these places resolved to on macOS before they moved onto the one location type. The
// keys of the units at them may be kept by the shipped app, so none may change.
describe("darwin's explore places", () => {
  test('resolves the container engines to the sockets and disk images of before', () => {
    const environment = buildTestMacEnvironment();
    const engines = darwinPlatform.explore.containerEngines;

    expect({
      dockerDesktopEngine: listEnginePlacePaths({
        environment: environment,
        engine: engines.dockerDesktopEngine,
      }),
      orbStackEngine: listEnginePlacePaths({
        environment: environment,
        engine: engines.orbStackEngine,
      }),
      colimaEngine: listEnginePlacePaths({
        environment: environment,
        engine: engines.colimaEngine,
      }),
    }).toEqual({
      dockerDesktopEngine: [
        '/Users/tester/.docker/run/docker.sock',
        '/Users/tester/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
      ],
      orbStackEngine: [
        '/Users/tester/.orbstack/run/docker.sock',
        '/Users/tester/Library/Group Containers/HUAQ24HBR6.dev.orbstack/data/data.img',
      ],
      colimaEngine: [
        '/Users/tester/.colima',
        '/Users/tester/.colima/_lima/_disks/colima/datadisk',
        '/Users/tester/.colima/_lima/_disks/colima-work/datadisk',
      ],
    });
  });

  test('keeps the key of an engine unit at the socket of before', () => {
    const environment = buildTestMacEnvironment();
    const engine = darwinPlatform.explore.containerEngines.dockerDesktopEngine;

    if (engine === null || engine.kind !== 'fixed') {
      throw new Error('Docker Desktop is no engine of fixed places on macOS.');
    }

    expect(
      formatExploreUnitKey({
        unit: {
          kind: 'engineVolume',
          engineProbeId: 'dockerDesktopEngine',
          engineName: engine.engineName,
          socketPath: resolveEnvironmentLocation({
            folders: environment,
            location: engine.socketPaths[0],
          }),
          diskImagePath: resolveEnvironmentLocation({
            folders: environment,
            location: engine.diskImagePath,
          }),
          sizeBytes: 1,
          volumeName: buildVolumeName('data'),
        },
      }),
    ).toBe('engineVolume:dockerDesktopEngine:/Users/tester/.docker/run/docker.sock:data');
  });

  test('resolves the IDE version roots to the folders of before', () => {
    const environment = buildTestMacEnvironment();
    const roots = darwinPlatform.explore.ideVersionRoots;

    expect<Record<string, string[]>>({
      caches: resolveEnvironmentLocations({ folders: environment, locations: roots.caches }),
      logs: resolveEnvironmentLocations({ folders: environment, locations: roots.logs }),
      settings: resolveEnvironmentLocations({ folders: environment, locations: roots.settings }),
    }).toEqual({
      caches: ['/Users/tester/Library/Caches/JetBrains', '/Users/tester/Library/Caches/Google'],
      logs: ['/Users/tester/Library/Logs/JetBrains', '/Users/tester/Library/Logs/Google'],
      settings: [
        '/Users/tester/Library/Application Support/JetBrains',
        '/Users/tester/Library/Application Support/Google',
      ],
    });
  });

  test('resolves the folders of iCloud Drive, Mail and Downloads to those of before', () => {
    const environment = buildTestMacEnvironment();
    const explore = darwinPlatform.explore;
    const folderRoots = [explore.icloudDriveRoot, explore.mailDownloadsRoot, explore.downloadsRoot];

    expect(
      folderRoots.map((location): string | null =>
        location === null
          ? null
          : resolveEnvironmentLocation({ folders: environment, location: location }),
      ),
    ).toEqual([
      '/Users/tester/Library/Mobile Documents',
      '/Users/tester/Library/Containers/com.apple.mail/Data/Library/Mail Downloads',
      '/Users/tester/Downloads',
    ]);
  });

  test("resolves pnpm's install places to those its loader named before", () => {
    const environment = buildTestMacEnvironment();
    const places = darwinPlatform.explore.pnpmInstallPlaces;

    expect<Record<string, string[]>>({
      homes: resolveEnvironmentLocations({ folders: environment, locations: places.homes }),
      corepackRoots: resolveEnvironmentLocations({
        folders: environment,
        locations: places.corepackRoots,
      }),
      launchers: resolveEnvironmentLocations({ folders: environment, locations: places.launchers }),
      npmPrefixes: resolveEnvironmentLocations({
        folders: environment,
        locations: places.npmPrefixes,
      }),
      npmGlobalFolderNames: places.npmGlobalFolderNames,
    }).toEqual({
      homes: ['/Users/tester/Library/pnpm', '/Users/tester/.local/share/pnpm'],
      corepackRoots: [
        '/Users/tester/.cache/node/corepack/v1/pnpm',
        '/Users/tester/.cache/node/corepack/pnpm',
      ],
      launchers: ['/Users/tester/Library/pnpm/pnpm', '/Users/tester/.local/share/pnpm/pnpm'],
      npmPrefixes: [],
      npmGlobalFolderNames: ['lib', 'node_modules'],
    });
  });
});
