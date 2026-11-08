import type { CatalogEntry, EngineProbeId } from '../../../catalog/catalog.js';
import { CONTAINER_ENGINES } from '../containerEngines.js';
import { buildBundleIdOwner } from './buildBundleIdOwner.js';

/** What every engine's advice says of `docker system prune`, whose `--volumes` misleads. */
const PRUNE_ADVICE =
  'or run `docker system prune`, whose `--volumes` adds only anonymous volumes; `docker volume prune --all` removes the unused named ones too.';

/**
 * The container engines, each probed through its own API with its disk image's advice for when
 * it is not running, then the download caches of the virtual machine tools.
 */
export const CONTAINER_ENTRIES: CatalogEntry[] = [
  buildEngineEntry({
    id: 'docker-desktop-disk-image',
    engineProbeId: 'dockerDesktopEngine',
    title: 'Docker Desktop disk image',
    explanation:
      'The one file where Docker Desktop keeps its images, containers, volumes, and build cache.',
    advice: `Start Docker Desktop and scan again to see what can go, ${PRUNE_ADVICE} Never move or delete the file itself.`,
    app: {
      bundleId: 'com.docker.docker',
      uninstalledAdvice:
        'Docker Desktop is no longer installed, so nothing uses this disk image now. If you no longer need the images, containers, and volumes it holds, delete the folder Library/Containers/com.docker.docker in your home folder.',
    },
  }),
  buildEngineEntry({
    id: 'orbstack-disk-image',
    engineProbeId: 'orbStackEngine',
    title: 'OrbStack disk image',
    explanation:
      'The one file where OrbStack keeps its images, containers, volumes, and Linux machines. It shrinks on its own as their data goes.',
    advice: `Start OrbStack and scan again to see what can go, ${PRUNE_ADVICE} Never move or delete the file itself.`,
    app: {
      bundleId: 'dev.kdrag0n.MacVirt',
      uninstalledAdvice:
        'OrbStack is no longer installed, so nothing uses this disk image now. If you no longer need the images, containers, volumes, and Linux machines it holds, delete the folder Library/Group Containers/HUAQ24HBR6.dev.orbstack in your home folder.',
    },
  }),
  buildEngineEntry({
    id: 'colima-disk-image',
    engineProbeId: 'colimaEngine',
    title: 'Colima disk image',
    explanation: 'The disk where Colima keeps its images, containers, and volumes.',
    advice: `Start Colima and scan again to see what can go, ${PRUNE_ADVICE} Never move or delete the disk itself.`,
    app: null,
  }),
  {
    id: 'lima-download-cache',
    category: 'containerEngines',
    title: 'Lima downloads',
    explanation: 'System images Lima downloaded to create its virtual machines.',
    regeneration: 'Lima downloads an image again when it creates a machine that needs it.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/lima',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'colima-download-cache',
    category: 'containerEngines',
    title: 'Colima downloads',
    explanation: 'System images Colima downloaded to create its virtual machines.',
    regeneration: 'Colima downloads an image again when it creates a machine that needs it.',
    risk: 'safe',
    root: 'home',
    path: 'Library/Caches/colima',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'rancher-desktop-cache',
    category: 'containerEngines',
    title: 'Rancher Desktop cache',
    explanation:
      'Files Rancher Desktop keeps as its cache, such as the Kubernetes releases it downloaded.',
    regeneration: 'Rancher Desktop downloads what it needs again, which takes a while.',
    risk: 'review',
    root: 'home',
    path: 'Library/Caches/rancher-desktop',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'tart-image-cache',
    category: 'containerEngines',
    title: 'Tart image cache',
    explanation: 'Virtual machine images Tart pulled from registries.',
    regeneration: 'Tart pulls an image again when you clone or run it.',
    risk: 'review',
    root: 'home',
    path: '.tart/cache/OCIs',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: { kind: 'delete' },
  },
  {
    id: 'vagrant-boxes',
    category: 'containerEngines',
    title: 'Vagrant boxes',
    explanation:
      'Boxes Vagrant downloaded to create its virtual machines, one folder for each version.',
    regeneration: 'A removed version comes back when a Vagrantfile asks for it again.',
    risk: 'review',
    root: 'home',
    path: '.vagrant.d/boxes',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'vagrantBoxes',
      advice:
        'Remove the box versions you no longer use with `vagrant box prune`, or one at a time with `vagrant box remove <name> --box-version <version>`.',
    },
  },
];

/** The app an engine runs in, with the advice for its disk image once the app is gone. */
type EngineApp = { bundleId: string; uninstalledAdvice: string };

/**
 * An engine's entry, on the disk image its units also name, owned by the engine's app, `null`
 * for an engine of no app. Its own running engine removes its units, so the app holds back none.
 */
function buildEngineEntry(params: {
  id: string;
  engineProbeId: EngineProbeId;
  title: string;
  explanation: string;
  advice: string;
  app: EngineApp | null;
}): CatalogEntry {
  return {
    id: params.id,
    category: 'containerEngines',
    title: params.title,
    explanation: params.explanation,
    regeneration: 'Images come back when you download them again, but stored data does not.',
    risk: 'careful',
    root: 'home',
    path: CONTAINER_ENGINES[params.engineProbeId].diskImagePath.join('/'),
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner:
      params.app === null
        ? null
        : buildBundleIdOwner({
            text: params.app.bundleId,
            uninstalledAdvice: params.app.uninstalledAdvice,
          }),
    removal: { kind: 'explore', probe: params.engineProbeId, advice: params.advice },
  };
}
