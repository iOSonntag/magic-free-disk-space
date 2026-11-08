import { describe, expect, test } from 'bun:test';
import type { EnvironmentFolders } from '../../../src/environment/buildEnvironment.js';
import {
  resolveEnvironmentLocation,
  resolveEnvironmentLocations,
} from '../../../src/environment/environmentLocation.js';
import type { ContainerEngine } from '../../../src/explore/explorePlatform.js';
import { formatExploreUnitKey } from '../../../src/explore/formatExploreUnitKey.js';
import { darwinPlatform } from '../../../src/platform/darwin/darwinPlatform.js';
import { buildVolumeName } from '../../explore/engineFixtures.js';
import { exampleDarwinEnvironment } from '../../support/environmentFixtures.js';

/**
 * Every place an engine names: a fixed engine's sockets and disk image; a profile engine's
 * profiles folder, its default disk image, and the disk image of a profile `work`.
 */
function listEnginePlacePaths(params: {
  folders: EnvironmentFolders;
  engine: ContainerEngine | null;
}): string[] {
  if (params.engine === null) {
    return [];
  }

  switch (params.engine.kind) {
    case 'fixed':
      return resolveEnvironmentLocations({
        folders: params.folders,
        locations: [...params.engine.socketPaths, params.engine.diskImagePath],
      });
    case 'profiles':
      return resolveEnvironmentLocations({
        folders: params.folders,
        locations: [
          params.engine.profilesRoot,
          params.engine.diskImagePath,
          params.engine.buildDiskImagePath('work'),
        ],
      });
  }
}

// The paths of macOS whose unit keys the shipped app may keep, so none may change.
describe("darwin's explore places", () => {
  test('resolves the container engines to their sockets and disk images', () => {
    const engines = darwinPlatform.explore.containerEngines;

    expect({
      dockerDesktopEngine: listEnginePlacePaths({
        folders: exampleDarwinEnvironment,
        engine: engines.dockerDesktopEngine,
      }),
      orbStackEngine: listEnginePlacePaths({
        folders: exampleDarwinEnvironment,
        engine: engines.orbStackEngine,
      }),
      colimaEngine: listEnginePlacePaths({
        folders: exampleDarwinEnvironment,
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

  test('keeps the key of an engine unit at its socket', () => {
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
            folders: exampleDarwinEnvironment,
            location: engine.socketPaths[0],
          }),
          diskImagePath: resolveEnvironmentLocation({
            folders: exampleDarwinEnvironment,
            location: engine.diskImagePath,
          }),
          sizeBytes: 1,
          volumeName: buildVolumeName('data'),
        },
      }),
    ).toBe('engineVolume:dockerDesktopEngine:/Users/tester/.docker/run/docker.sock:data');
  });

  test('resolves the IDE version roots to their folders', () => {
    const roots = darwinPlatform.explore.ideVersionRoots;

    expect<Record<string, string[]>>({
      caches: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: roots.caches,
      }),
      logs: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: roots.logs,
      }),
      settings: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: roots.settings,
      }),
    }).toEqual({
      caches: ['/Users/tester/Library/Caches/JetBrains', '/Users/tester/Library/Caches/Google'],
      logs: ['/Users/tester/Library/Logs/JetBrains', '/Users/tester/Library/Logs/Google'],
      settings: [
        '/Users/tester/Library/Application Support/JetBrains',
        '/Users/tester/Library/Application Support/Google',
      ],
    });
  });

  test('resolves the folders of iCloud Drive, Mail and Downloads', () => {
    const explore = darwinPlatform.explore;
    const folderRoots = [explore.icloudDriveRoot, explore.mailDownloadsRoot, explore.downloadsRoot];

    expect(
      folderRoots.map((location): string | null =>
        location === null
          ? null
          : resolveEnvironmentLocation({ folders: exampleDarwinEnvironment, location: location }),
      ),
    ).toEqual([
      '/Users/tester/Library/Mobile Documents',
      '/Users/tester/Library/Containers/com.apple.mail/Data/Library/Mail Downloads',
      '/Users/tester/Downloads',
    ]);
  });

  test("resolves pnpm's install places to their folders", () => {
    const places = darwinPlatform.explore.pnpmInstallPlaces;

    expect<Record<string, string[]>>({
      homes: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.homes,
      }),
      corepackRoots: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.corepackRoots,
      }),
      pnpmVersionsRoots: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.pnpmVersionsRoots,
      }),
      miseInstallsRoots: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.miseInstallsRoots,
      }),
      launchers: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.launchers,
      }),
      npmPrefixes: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.npmPrefixes,
      }),
      npmGlobalFolderNames: places.npmGlobalFolderNames,
      nodeVersionsRoots: resolveEnvironmentLocations({
        folders: exampleDarwinEnvironment,
        locations: places.nodeVersionsRoots.map((root) => root.location),
      }),
      nodePrefixNames: places.nodeVersionsRoots.map((root) => root.prefixNames.join('/')),
    }).toEqual({
      homes: ['/Users/tester/Library/pnpm', '/Users/tester/.local/share/pnpm'],
      corepackRoots: [
        '/Users/tester/.cache/node/corepack/v1/pnpm',
        '/Users/tester/.cache/node/corepack/pnpm',
      ],
      pnpmVersionsRoots: ['/Users/tester/.asdf/installs/pnpm'],
      miseInstallsRoots: ['/Users/tester/.local/share/mise/installs'],
      launchers: ['/Users/tester/Library/pnpm/pnpm', '/Users/tester/.local/share/pnpm/pnpm'],
      npmPrefixes: [],
      npmGlobalFolderNames: ['lib', 'node_modules'],
      nodeVersionsRoots: [
        '/Users/tester/.asdf/installs/nodejs',
        '/Users/tester/.local/share/mise/installs/node',
        '/Users/tester/.nvm/versions/node',
      ],
      // Each node version is its own npm prefix on macOS.
      nodePrefixNames: ['', '', ''],
    });
  });
});
