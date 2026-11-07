import type { EngineProbeId } from '../../catalog/catalog.js';
import type { ContainerEngine, HomeRelativePathNames } from '../../explore/explorePlatform.js';

/** The profile Colima runs without `--profile`, the folder `~/.colima/default`. */
const COLIMA_DEFAULT_PROFILE_NAME = 'default';

/**
 * The data disk Lima keeps for a Colima profile, below Colima's own Lima home: Lima names the
 * instance `colima` for the default profile and `colima-<profile>` for the others.
 */
function buildColimaDiskImagePath(profileName: string): HomeRelativePathNames {
  const instanceName =
    profileName === COLIMA_DEFAULT_PROFILE_NAME ? 'colima' : `colima-${profileName}`;

  return ['.colima', '_lima', '_disks', instanceName, 'datadisk'];
}

/**
 * The container engines on macOS, each with the sockets its probe asks and its disk image:
 * - Docker Desktop's socket, which `/var/run/docker.sock` links to, and its `Docker.raw`, from
 *   docs.docker.com (the Mac permission requirements, and the Mac FAQ);
 * - OrbStack's socket and its `data.img` in its group container, from docs.orbstack.dev (the FAQ);
 * - Colima's profiles, each with the socket its Lima host agent binds in the profile's folder and
 *   the data disk Lima keeps for it (Colima's `config/profile.go` and `config/files.go`, and
 *   Lima's `pkg/store`). Colima's own folders there start with `_`, such as `_lima`.
 */
export const CONTAINER_ENGINES: Record<EngineProbeId, ContainerEngine> = {
  dockerDesktopEngine: {
    kind: 'fixed',
    engineName: 'Docker Desktop',
    socketPaths: [['.docker', 'run', 'docker.sock']],
    diskImagePath: [
      'Library',
      'Containers',
      'com.docker.docker',
      'Data',
      'vms',
      '0',
      'data',
      'Docker.raw',
    ],
  },
  orbStackEngine: {
    kind: 'fixed',
    engineName: 'OrbStack',
    socketPaths: [['.orbstack', 'run', 'docker.sock']],
    diskImagePath: ['Library', 'Group Containers', 'HUAQ24HBR6.dev.orbstack', 'data', 'data.img'],
  },
  colimaEngine: {
    kind: 'profiles',
    engineName: 'Colima',
    profilesRoot: ['.colima'],
    socketName: 'docker.sock',
    defaultProfileName: COLIMA_DEFAULT_PROFILE_NAME,
    buildDiskImagePath: buildColimaDiskImagePath,
    diskImagePath: buildColimaDiskImagePath(COLIMA_DEFAULT_PROFILE_NAME),
  },
};
