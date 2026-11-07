import type { EngineProbeId } from '../../catalog/catalog.js';
import type { ContainerEngine } from '../../explore/explorePlatform.js';

/**
 * The container engines on macOS, each with the sockets its probe asks and its disk image:
 * - Docker Desktop's socket, which `/var/run/docker.sock` links to, and its `Docker.raw`, from
 *   docs.docker.com (the Mac permission requirements, and the Mac FAQ);
 * - OrbStack's socket and its `data.img` in its group container, from docs.orbstack.dev (the FAQ);
 * - Colima's default profile, whose socket its Lima host agent binds in the profile's folder, and
 *   the data disk Lima keeps for it (Colima's `config/files.go`, Lima's `pkg/store`).
 */
export const CONTAINER_ENGINES: Record<EngineProbeId, ContainerEngine> = {
  dockerDesktopEngine: {
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
    engineName: 'OrbStack',
    socketPaths: [['.orbstack', 'run', 'docker.sock']],
    diskImagePath: ['Library', 'Group Containers', 'HUAQ24HBR6.dev.orbstack', 'data', 'data.img'],
  },
  colimaEngine: {
    engineName: 'Colima',
    socketPaths: [['.colima', 'default', 'docker.sock']],
    diskImagePath: ['.colima', '_lima', '_disks', 'colima', 'datadisk'],
  },
};
