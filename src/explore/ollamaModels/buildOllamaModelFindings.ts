import type { RunningProcesses } from '../../system/systemPlatform.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { OllamaModelOffer } from './decideOllamaModelOffers.js';
import { decideOllamaModelOffers } from './decideOllamaModelOffers.js';
import type { OllamaModelState } from './loadOllamaModelState.js';
import type { OllamaModelName } from './parseOllamaModelName.js';

// The hosts of Ollama's own registry in its first layout and in its v2 names, and its namespace.
const OLLAMA_DEFAULT_HOSTS = ['registry.ollama.ai', 'ollama.com'];

const OLLAMA_DEFAULT_NAMESPACE = 'library';

/** Offers each model with the blobs only it names; nothing while a manifest cannot be read. */
export function buildOllamaModelFindings(params: {
  state: OllamaModelState;
  runningProcesses: RunningProcesses | null;
}): ExploreProbeFindings {
  switch (params.state.kind) {
    case 'noModels':
      return { findings: [], isComplete: true };
    case 'installed': {
      const offers = decideOllamaModelOffers({ state: params.state });

      if (offers === null) {
        return { findings: [], isComplete: false };
      }

      return {
        findings: offers.map((offer) =>
          buildOllamaModelFinding({ offer: offer, runningProcesses: params.runningProcesses }),
        ),
        isComplete: true,
      };
    }
  }
}

/**
 * The name Ollama shows for a manifest: `<model>:<tag>` on its own registry's `library`, with the
 * namespace or the host before it otherwise.
 */
export function formatOllamaModelName(params: { name: OllamaModelName }): string {
  const modelTag = `${params.name.model}:${params.name.tag}`;

  if (!OLLAMA_DEFAULT_HOSTS.includes(params.name.host)) {
    return `${params.name.host}/${params.name.namespace}/${modelTag}`;
  }

  return params.name.namespace === OLLAMA_DEFAULT_NAMESPACE
    ? modelTag
    : `${params.name.namespace}/${modelTag}`;
}

function buildOllamaModelFinding(params: {
  offer: OllamaModelOffer;
  runningProcesses: RunningProcesses | null;
}): ExploreFinding {
  const modelName = formatOllamaModelName({ name: params.offer.manifest.name });
  const sharedCount = params.offer.digestCount - params.offer.blobPaths.length;

  return {
    unit: {
      kind: 'ollamaModel',
      modelName: modelName,
      manifestPath: params.offer.manifest.path,
      downloadedAtMs: params.offer.manifest.modifiedMs,
      foundPaths: [params.offer.manifest.path, ...params.offer.blobPaths],
    },
    title: `Ollama model ${modelName}`,
    explanation: 'A local AI model Ollama downloaded, with the files no other model of it uses.',
    regeneration: 'Ollama downloads it again when you pull or run this model again.',
    risk: 'review',
    evidenceLines: [
      `Ollama's manifest of ${modelName} names ${params.offer.digestCount} files.`,
      sharedCount === 0
        ? 'No other model names any of them.'
        : `${sharedCount} of them belong to other models too and stay.`,
    ],
    displayPath: params.offer.manifest.path,
    activity: decideUnitActivity({
      facts: { kind: 'ollama' },
      runningProcesses: params.runningProcesses,
    }),
  };
}
