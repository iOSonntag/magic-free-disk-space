import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreEngineUnitPlace, ExploreFinding, UnitActivity } from '../exploreUnit.js';
import { formatDaySpan } from '../formatLimitTexts.js';
import {
  BUILD_RECORD_UNUSED_MS,
  isDanglingImage,
  isStoppedContainer,
  isUnusedBuildRecord,
  isUnusedTaggedImage,
  isUnusedVolume,
} from './engineUnitRules.js';
import type {
  EngineContainerRecord,
  EngineDiskUsage,
  EngineImageRecord,
  EngineVolumeRecord,
} from './parseEngineDiskUsage.js';

/** Where an engine's units live: the engine, the socket its probe trusted, and its disk image. */
export type EngineUnitPlace = Omit<ExploreEngineUnitPlace, 'sizeBytes'>;

/** The length of the short id the engine's own tools show. */
const SHORT_ID_LENGTH = 12;

const ANONYMOUS_VOLUME_NAME_PATTERN = /^[0-9a-f]{64}$/;

/**
 * The engine's units: its unused build cache and its untagged images as one unit each, then every
 * unused tagged image, stopped container and unused volume on its own.
 */
export function buildEngineFindings(params: {
  place: EngineUnitPlace;
  usage: EngineDiskUsage;
  nowMs: number;
  processCommands: string[] | null;
}): ExploreFinding[] {
  const facts = {
    place: params.place,
    activity: decideUnitActivity({
      facts: { kind: 'engine' },
      processCommands: params.processCommands,
    }),
  };

  return [
    ...buildBuildCacheFindings({ ...facts, usage: params.usage, nowMs: params.nowMs }),
    ...buildDanglingImageFindings({
      ...facts,
      images: params.usage.images.filter(isDanglingImage),
    }),
    ...params.usage.images
      .filter(isUnusedTaggedImage)
      .map((image) => buildImageFinding({ ...facts, image: image })),
    ...params.usage.containers
      .filter(isStoppedContainer)
      .map((container) => buildContainerFinding({ ...facts, container: container })),
    ...params.usage.volumes
      .filter(isUnusedVolume)
      .map((volume) => buildVolumeFinding({ ...facts, volume: volume })),
  ];
}

type EngineFindingFacts = {
  place: EngineUnitPlace;
  activity: UnitActivity;
};

function buildBuildCacheFindings(
  params: EngineFindingFacts & { usage: EngineDiskUsage; nowMs: number },
): ExploreFinding[] {
  const records = params.usage.buildRecords.filter((record) =>
    isUnusedBuildRecord({ record: record, nowMs: params.nowMs }),
  );

  if (records.length === 0) {
    return [];
  }

  const unusedSpan = formatDaySpan(BUILD_RECORD_UNUSED_MS);

  return [
    {
      unit: {
        kind: 'engineBuildCache',
        ...params.place,
        sizeBytes: sumBytes(records.map((record) => record.sizeBytes)),
        recordIds: records.map((record) => record.id),
      },
      title: `${params.place.engineName} build cache`,
      explanation: `Build steps that earlier builds cached and no build used for ${unusedSpan}.`,
      regeneration: 'The next build that needs a step runs it again.',
      risk: 'safe',
      evidenceLines: [
        `${countText({ count: records.length, noun: 'cache record' })} no build used for ${unusedSpan}, none of them shared with an image.`,
      ],
      displayPath: params.place.diskImagePath,
      activity: params.activity,
    },
  ];
}

function buildDanglingImageFindings(
  params: EngineFindingFacts & { images: EngineImageRecord[] },
): ExploreFinding[] {
  if (params.images.length === 0) {
    return [];
  }

  return [
    {
      unit: {
        kind: 'engineDanglingImages',
        ...params.place,
        sizeBytes: sumBytes(params.images.map((image) => image.uniqueSizeBytes)),
        imageIds: params.images.map((image) => image.id),
      },
      title: `${params.place.engineName} untagged images`,
      explanation:
        'Images without a tag that no container uses, left behind when a newer build or pull took their tag.',
      regeneration: 'Nothing needs them; a build or a pull makes again what it needs.',
      risk: 'safe',
      evidenceLines: [
        `${countText({ count: params.images.length, noun: 'image' })} without a tag, none of them used by a container.`,
      ],
      displayPath: params.place.diskImagePath,
      activity: params.activity,
    },
  ];
}

function buildImageFinding(
  params: EngineFindingFacts & { image: EngineImageRecord },
): ExploreFinding {
  const isFromRegistry = params.image.digests.length > 0;

  return {
    unit: {
      kind: 'engineImage',
      ...params.place,
      sizeBytes: params.image.uniqueSizeBytes,
      imageId: params.image.id,
    },
    title: `${params.place.engineName} image ${params.image.tags.join(', ')}`,
    explanation: isFromRegistry
      ? 'An image no container uses, which came from a registry.'
      : 'An image no container uses, which was built or loaded on this Mac.',
    regeneration: isFromRegistry
      ? 'A pull downloads it again from its registry.'
      : 'Only building or loading it again brings it back.',
    risk: isFromRegistry ? 'review' : 'careful',
    evidenceLines: [
      'No container uses it.',
      isFromRegistry ? 'Its registry digest is known.' : 'It has no registry digest.',
    ],
    displayPath: params.place.diskImagePath,
    activity: params.activity,
  };
}

function buildContainerFinding(
  params: EngineFindingFacts & { container: EngineContainerRecord },
): ExploreFinding {
  const shortId = params.container.id.slice(0, SHORT_ID_LENGTH);
  const isLayerEmpty = params.container.writableSizeBytes === 0;

  return {
    unit: {
      kind: 'engineContainer',
      ...params.place,
      sizeBytes: params.container.writableSizeBytes ?? 0,
      containerId: params.container.id,
    },
    title: `${params.place.engineName} container ${params.container.name ?? shortId}`,
    explanation: isLayerEmpty
      ? 'A stopped container that wrote no files of its own.'
      : 'A stopped container that keeps files it wrote in its own layer.',
    regeneration: isLayerEmpty
      ? 'Running its image again makes a new container, though its settings go with it.'
      : 'The files it wrote go with it for good.',
    risk: isLayerEmpty ? 'review' : 'careful',
    evidenceLines: [`Container ${shortId}, ${params.container.state}.`],
    displayPath: params.place.diskImagePath,
    activity: params.activity,
  };
}

function buildVolumeFinding(
  params: EngineFindingFacts & { volume: EngineVolumeRecord },
): ExploreFinding {
  const isAnonymous = ANONYMOUS_VOLUME_NAME_PATTERN.test(params.volume.name);
  const volumeTitle = isAnonymous
    ? `anonymous volume ${params.volume.name.slice(0, SHORT_ID_LENGTH)}`
    : `volume ${params.volume.name}`;

  return {
    unit: {
      kind: 'engineVolume',
      ...params.place,
      sizeBytes: params.volume.sizeBytes ?? 0,
      volumeName: params.volume.name,
    },
    title: `${params.place.engineName} ${volumeTitle}`,
    explanation: 'A volume no container mounts, which keeps the data a container stored in it.',
    regeneration: 'Its data goes for good.',
    risk: 'careful',
    evidenceLines: ['No container mounts it.'],
    displayPath: params.place.diskImagePath,
    activity: params.activity,
  };
}

function sumBytes(sizes: number[]): number {
  return sizes.reduce((total, size) => total + size, 0);
}

function countText(params: { count: number; noun: string }): string {
  return params.count === 1 ? `1 ${params.noun}` : `${params.count} ${params.noun}s`;
}
