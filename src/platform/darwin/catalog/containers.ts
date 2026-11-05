import type { CatalogEntry } from '../../../catalog/catalog.js';
import { buildBundleIdOwner } from './buildBundleIdOwner.js';

/** Container apps, such as Docker Desktop, and the images and data they keep. */
export const CONTAINER_ENTRIES: CatalogEntry[] = [
  {
    id: 'docker-desktop-data',
    category: 'appContainers',
    title: 'Docker images and data',
    explanation:
      'Everything Docker keeps: the images, containers, and stored data of the programs you run in it.',
    regeneration: 'Images come back when you download them again, but stored data does not.',
    risk: 'careful',
    root: 'home',
    path: 'Library/Containers/com.docker.docker',
    scope: 'self',
    ageRule: 'none',
    owner: buildBundleIdOwner({ text: 'com.docker.docker' }),
    removal: {
      kind: 'advice',
      advice:
        'Holds every Docker image, container, and volume. Run `docker system prune` (add `--volumes` to include volumes) or use Clean / Purge data under Troubleshoot in Docker Desktop.',
    },
  },
];
