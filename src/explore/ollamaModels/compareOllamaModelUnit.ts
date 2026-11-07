import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitOllamaModel } from '../exploreUnit.js';
import { hasSamePaths } from '../hasSamePaths.js';
import { decideOllamaModelOffers } from './decideOllamaModelOffers.js';
import type { OllamaModelState } from './loadOllamaModelState.js';

/**
 * Unchanged while the model is still offered with exactly the blobs of the scan, so a manifest
 * written since that names one of them keeps it, and while Ollama is idle.
 */
export function compareOllamaModelUnit(params: {
  unit: ExplorePathUnitOllamaModel;
  state: OllamaModelState;
  processCommands: string[] | null;
}): UnitComparison {
  switch (params.state.kind) {
    case 'noModels':
      return { kind: 'changed' };
    case 'installed': {
      const offer = (decideOllamaModelOffers({ state: params.state }) ?? []).find(
        (candidate) => candidate.manifest.path === params.unit.manifestPath,
      );

      if (
        offer === undefined ||
        !hasSamePaths({
          left: [offer.manifest.path, ...offer.blobPaths],
          right: params.unit.foundPaths,
        })
      ) {
        return { kind: 'changed' };
      }

      return decideComparisonActivity({
        facts: { kind: 'ollama' },
        processCommands: params.processCommands,
      });
    }
  }
}
