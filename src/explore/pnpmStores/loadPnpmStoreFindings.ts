import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { loadExploreRealPath } from '../loadExploreRead.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { buildPnpmStoreFindings } from './buildPnpmStoreFindings.js';
import { decidePnpmStoreOffers } from './decidePnpmStoreOffers.js';
import { loadPnpmInstallState } from './loadPnpmInstallState.js';
import { loadPnpmStoreState } from './loadPnpmStoreState.js';
import { PNPM_PIN_FILE_KINDS, toolPinsToPnpmPins } from './parsePnpmPins.js';

/**
 * The store-version folders of the store at `storeRootPathNames` below the home folder that
 * neither an installed pnpm nor one a project pins uses, and that no global package links into.
 */
export async function loadPnpmStoreFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
  storeRootPathNames: string[];
}): Promise<ExploreProbeFilesResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: PNPM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const storeRoot = joinAbsolutePath({
    parentPath: params.run.environment.homeDir,
    names: params.storeRootPathNames,
  });
  const storeState = await loadPnpmStoreState({ storeRoot: storeRoot });

  if (storeState.kind === 'failed') {
    return storeState;
  }

  if (storeState.value.folders.length === 0) {
    return { kind: 'succeeded', value: { findings: [], isComplete: true } };
  }

  const storeRootRealPath = await loadExploreRealPath({ path: storeRoot });

  if (storeRootRealPath.kind === 'failed') {
    return storeRootRealPath;
  }

  if (storeRootRealPath.value === null) {
    return { kind: 'succeeded', value: { findings: [], isComplete: true } };
  }

  const installState = await loadPnpmInstallState({
    homeDir: params.run.environment.homeDir,
    homebrewPrefixPaths: params.run.environment.homebrewPrefixPaths,
  });

  if (installState.kind === 'failed') {
    return installState;
  }

  const offers = decidePnpmStoreOffers({
    storeState: storeState.value,
    storeRootRealPath: storeRootRealPath.value,
    installState: installState.value,
    pins: toolPinsToPnpmPins({ toolPins: toolPins.value }),
  });

  return {
    kind: 'succeeded',
    value: buildPnpmStoreFindings({
      offers: offers,
      storeRoot: storeRoot,
      pinFiles: listToolPinFileRefs({ toolPins: toolPins.value }),
      projectPins: params.projectPins,
      processCommands: params.run.processCommands,
    }),
  };
}
