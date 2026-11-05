import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExplorePathUnitOllamaModel } from '../exploreUnit.js';
import { decideOllamaModelOffers } from './decideOllamaModelOffers.js';
import type { OllamaModelState } from './loadOllamaModelState.js';

/**
 * Unchanged while the model's manifest is the one of the scan and its offer still holds every path
 * of the unit, and while Ollama is idle. A manifest written since that names one of the unit's
 * blobs keeps the blob and so changes the unit; a blob only the model names since another model
 * went, such as one it shared with a model removed in the same run, does not.
 */
export function compareOllamaModelUnit(params: {
  unit: ExplorePathUnitOllamaModel;
  state: OllamaModelState;
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  switch (params.state.kind) {
    case 'noModels':
      return { kind: 'changed' };
    case 'installed': {
      const offer = (decideOllamaModelOffers({ state: params.state }) ?? []).find(
        (candidate) => candidate.manifest.path === params.unit.manifestPath,
      );

      if (offer === undefined || offer.manifest.modifiedMs !== params.unit.downloadedAtMs) {
        return { kind: 'changed' };
      }

      const offerPaths = new Set([offer.manifest.path, ...offer.blobPaths]);

      if (!params.unit.foundPaths.every((path) => offerPaths.has(path))) {
        return { kind: 'changed' };
      }

      return decideComparisonActivity({
        facts: { kind: 'ollama' },
        runningProcesses: params.runningProcesses,
      });
    }
  }
}
