import type { EngineProbeId } from '../../catalog/catalog.js';
import type { ContainerEngine } from '../../explore/explorePlatform.js';
import { stubPartNotBuilt } from '../../notBuilt.js';

/**
 * The container engines on macOS, each with the sockets its probe asks and its disk image. Part 2
 * settles each socket path and disk image; until then no probe reads them.
 */
export const CONTAINER_ENGINES = stubPartNotBuilt<Record<EngineProbeId, ContainerEngine>>({
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
    diskImagePath: ['.orbstack', 'data', 'data.img'],
  },
  colimaEngine: {
    engineName: 'Colima',
    socketPaths: [['.colima', 'default', 'docker.sock']],
    diskImagePath: ['.colima', '_lima', '_disks', 'colima', 'datadisk'],
  },
});
