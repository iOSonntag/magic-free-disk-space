import type { Result } from '../../result.js';
import type { ExploreProbeRun, ExploreProbeToolRun } from '../exploreProbe.js';
import type {
  ExploreFileUnreadable,
  ExploreProbeFailure,
  ExploreProbeFindings,
} from '../exploreUnit.js';

// Not judged until part 2A builds these probes, so their entries stay advice.
const NOT_JUDGED_FINDINGS: ExploreProbeFindings = { findings: [], isComplete: false };

/** The AVDs not used since the cutoff, each removed by the located `avdmanager`. */
export async function loadAndroidAvdFindings(
  _run: ExploreProbeToolRun,
): Promise<Result<ExploreProbeFindings, ExploreProbeFailure>> {
  return { kind: 'succeeded', value: NOT_JUDGED_FINDINGS };
}

/** The system image folders of the SDK that no AVD names. */
export async function loadAndroidSystemImageFindings(
  _run: ExploreProbeRun,
): Promise<Result<ExploreProbeFindings, ExploreFileUnreadable>> {
  return { kind: 'succeeded', value: NOT_JUDGED_FINDINGS };
}

/** The emulator package of the SDK while no AVD exists. */
export async function loadAndroidEmulatorFindings(
  _run: ExploreProbeRun,
): Promise<Result<ExploreProbeFindings, ExploreFileUnreadable>> {
  return { kind: 'succeeded', value: NOT_JUDGED_FINDINGS };
}
