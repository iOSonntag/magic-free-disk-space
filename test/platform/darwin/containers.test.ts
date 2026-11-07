import { describe, expect, test } from 'bun:test';
import type { CatalogEntry, EngineProbeId } from '../../../src/catalog/catalog.js';
import { CONTAINER_ENTRIES } from '../../../src/platform/darwin/catalog/containers.js';
import { CONTAINER_ENGINES } from '../../../src/platform/darwin/containerEngines.js';

function findEngineEntry(engineProbeId: EngineProbeId): CatalogEntry | undefined {
  return CONTAINER_ENTRIES.find(
    (entry) => entry.removal.kind === 'explore' && entry.removal.probe === engineProbeId,
  );
}

describe('CONTAINER_ENTRIES', () => {
  test('the Docker entry has no owner, so it is not held back while Docker runs', () => {
    expect(findEngineEntry('dockerDesktopEngine')?.owner).toBeNull();
  });

  test('each engine has its own entry on the disk image its units name', () => {
    const engineProbeIds: EngineProbeId[] = [
      'dockerDesktopEngine',
      'orbStackEngine',
      'colimaEngine',
    ];

    expect(
      engineProbeIds.map((engineProbeId) => {
        const entry = findEngineEntry(engineProbeId);

        return [entry?.root, entry?.path, entry?.category, entry?.owner];
      }),
    ).toEqual(
      engineProbeIds.map((engineProbeId) => [
        'home',
        CONTAINER_ENGINES[engineProbeId].diskImagePath.join('/'),
        'containerEngines',
        null,
      ]),
    );
  });

  test('each engine advice says that --volumes removes only anonymous volumes', () => {
    const advices = CONTAINER_ENTRIES.flatMap((entry) =>
      entry.removal.kind === 'explore' && entry.removal.probe !== 'vagrantBoxes'
        ? [entry.removal.advice]
        : [],
    );

    expect(advices).toHaveLength(3);

    for (const advice of advices) {
      expect(advice).toContain('`--volumes` adds only anonymous volumes');
      expect(advice).not.toContain('to include volumes');
    }
  });

  test('the Vagrant boxes are probed, and the download caches deleted whole', () => {
    expect(
      CONTAINER_ENTRIES.filter((entry) => entry.removal.kind !== 'explore').map((entry) => [
        entry.path,
        entry.risk,
      ]),
    ).toEqual([
      ['Library/Caches/lima', 'safe'],
      ['Library/Caches/colima', 'safe'],
      ['Library/Caches/rancher-desktop', 'review'],
      ['.tart/cache/OCIs', 'review'],
    ]);
    expect(
      CONTAINER_ENTRIES.find((entry) => entry.path === '.vagrant.d/boxes')?.removal,
    ).toMatchObject({ kind: 'explore', probe: 'vagrantBoxes' });
  });
});
