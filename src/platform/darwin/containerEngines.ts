import type { CatalogLocation, EngineProbeId } from '../../catalog/catalog.js';
import type { ContainerEngine } from '../../explore/explorePlatform.js';

/** The profile Colima runs without `--profile`, the folder `~/.colima/default`. */
const COLIMA_DEFAULT_PROFILE_NAME = 'default';

/**
 * The data disk Lima keeps for a Colima profile, below Colima's own Lima home: Lima names the
 * instance `colima` for the default profile and `colima-<profile>` for the others.
 */
function buildColimaDiskImagePath(profileName: string): CatalogLocation {
  const instanceName =
    profileName === COLIMA_DEFAULT_PROFILE_NAME ? 'colima' : `colima-${profileName}`;

  return { root: 'home', path: `.colima/_lima/_disks/${instanceName}/datadisk` };
}

/** The container engines on macOS, each with the sockets its probe asks and its disk image. */
export const CONTAINER_ENGINES: Record<EngineProbeId, ContainerEngine> = {
  dockerDesktopEngine: {
    kind: 'fixed',
    engineName: 'Docker Desktop',
    // `/var/run/docker.sock` links to this socket, as docs.docker.com says.
    socketPaths: [{ root: 'home', path: '.docker/run/docker.sock' }],
    diskImagePath: {
      root: 'home',
      path: 'Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw',
    },
  },
  orbStackEngine: {
    kind: 'fixed',
    engineName: 'OrbStack',
    socketPaths: [{ root: 'home', path: '.orbstack/run/docker.sock' }],
    diskImagePath: {
      root: 'home',
      path: 'Library/Group Containers/HUAQ24HBR6.dev.orbstack/data/data.img',
    },
  },
  colimaEngine: {
    kind: 'profiles',
    engineName: 'Colima',
    profilesRoot: { root: 'home', path: '.colima' },
    // Lima's host agent binds it in each profile's folder; Colima's own folders start with `_`.
    socketName: 'docker.sock',
    defaultProfileName: COLIMA_DEFAULT_PROFILE_NAME,
    buildDiskImagePath: buildColimaDiskImagePath,
    diskImagePath: buildColimaDiskImagePath(COLIMA_DEFAULT_PROFILE_NAME),
  },
};
