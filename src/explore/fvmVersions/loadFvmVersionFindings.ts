import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFinding } from '../exploreUnit.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/projectSearchEvidence.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { decideFvmVersionOffers } from './decideFvmVersionOffers.js';
import { loadFvmState } from './loadFvmState.js';
import { FVM_PIN_FILE_KINDS } from './parseFvmrcPins.js';

/** Offers each FVM version that is not the global one and that no `.fvmrc` found pins. */
export async function loadFvmVersionFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: FVM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadFvmState({
    pathRules: params.run.environment.pathRules,
    homeDir: params.run.environment.homeDir,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = listToolPinFileRefs({ toolPins: toolPins.value });
  const searchEvidenceLines = buildProjectSearchEvidence({
    pins: params.projectPins,
    incompleteEvidence: params.run.platform.explore.projectSearchIncompleteEvidence,
  });
  const findings = decideFvmVersionOffers({ state: state.value, toolPins: toolPins.value }).map(
    (folder) => {
      const finding: ExploreFinding = {
        unit: {
          kind: 'fvmVersion',
          version: folder.version,
          folderPath: folder.folderPath,
          pinFiles: pinFiles,
        },
        title: `Flutter ${folder.version} from FVM`,
        explanation: `A Flutter version installed with FVM that is not the global one and that no \`.fvmrc\` found asks for. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
        regeneration: 'FVM installs it again when a project asks for it.',
        risk: 'review',
        evidenceLines: [
          `None of the \`.fvmrc\` files found (${pinFiles.length}) names ${folder.version}.`,
          ...searchEvidenceLines,
        ],
        displayPath: folder.folderPath,
        activity: decideUnitActivity({
          facts: { kind: 'versionFolder', folderPath: folder.folderPath },
          runningProcesses: params.run.runningProcesses,
        }),
      };

      return finding;
    },
  );

  return {
    kind: 'succeeded',
    value: { findings: findings, isComplete: !state.value.hasUnjudgedFolder },
  };
}
