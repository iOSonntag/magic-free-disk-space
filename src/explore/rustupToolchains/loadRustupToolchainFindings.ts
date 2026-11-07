import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreFinding } from '../exploreUnit.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/projectSearchEvidence.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { decideRustupToolchainOffers } from './decideRustupToolchainOffers.js';
import { loadRustupState } from './loadRustupState.js';
import { RUSTUP_PIN_FILE_KINDS } from './parseRustToolchainPins.js';

/** Offers each toolchain `rustup toolchain list` gives that is not the default and no project pins. */
export async function loadRustupToolchainFindings(params: {
  run: ExploreProbeToolRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeToolResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: RUSTUP_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadRustupState({
    run: params.run,
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
  const activity = decideUnitActivity({
    facts: { kind: 'rustup' },
    processCommands: params.run.processCommands,
  });
  const findings = decideRustupToolchainOffers({
    state: state.value,
    toolPins: toolPins.value,
  }).map((toolchain) => {
    const finding: ExploreFinding = {
      unit: {
        kind: 'rustupToolchain',
        tool: params.run.tool,
        name: toolchain.name,
        toolchainPath: toolchain.toolchainPath,
        pinFiles: pinFiles,
      },
      title: `Rust toolchain ${toolchain.name}`,
      explanation: `A Rust toolchain installed with rustup that is not the default and that no \`rust-toolchain\` file found asks for. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
      regeneration: 'rustup installs it again when a project asks for it.',
      risk: 'review',
      evidenceLines: [
        `None of the \`rust-toolchain\` files found (${pinFiles.length}) and no folder override names ${toolchain.name}.`,
        ...searchEvidenceLines,
      ],
      displayPath: toolchain.toolchainPath,
      activity: activity,
    };

    return finding;
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}
