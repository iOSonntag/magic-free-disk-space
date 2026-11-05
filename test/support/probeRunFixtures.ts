import type { Environment } from '../../src/environment/buildEnvironment.js';
import type {
  ExploreProbePlatform,
  ExploreProbeRun,
  ExploreProbeToolRun,
} from '../../src/explore/exploreProbe.js';
import type { ExploreProbeFindings, ExploreUnit } from '../../src/explore/exploreUnit.js';
import type { Result } from '../../src/result.js';
import type { RunningProcesses } from '../../src/system/systemPlatform.js';
import type { LocatedTool } from '../../src/tools/findTrustedTool.js';
import type { FixtureRoot } from './fixtureRoot.js';
import { loadTestEnvironment, withFixtureRoot } from './fixtureRoot.js';
import { buildTestProbePlatform } from './probePlatformFixtures.js';
import { buildRunningCommandLines } from './runningProcessesFixtures.js';

/** How long a test probe run may take before its deadline. */
const TEST_PROBE_RUN_DURATION_MS = 10_000;

/** A temporary home of a test, with the environment over it. */
export type FixtureHome = { fixtureRoot: FixtureRoot; environment: Environment };

/** What a test probe run is built from; each value left out takes its default. */
type TestProbeRunParams = {
  environment: Environment;
  /** `null` for processes that could not be read; no process runs when it is left out. */
  runningProcesses?: RunningProcesses | null;
  platform?: ExploreProbePlatform;
  staleCutoffMs?: number;
  unusedCutoffMs?: number;
};

/** A unit of the kind `TKind`. */
export type ExploreUnitOfKind<TKind extends ExploreUnit['kind']> = Extract<
  ExploreUnit,
  { kind: TKind }
>;

/**
 * Builds a temporary home with its environment at `nowMs`, hands it to `run`, and removes it
 * afterwards, whatever `run` does.
 */
export async function withFixtureHome(params: {
  nowMs: number;
  run: (home: FixtureHome) => Promise<void>;
}): Promise<void> {
  await withFixtureRoot({
    run: async (fixtureRoot) => {
      const environment = await loadTestEnvironment({
        fixtureRoot: fixtureRoot,
        nowMs: params.nowMs,
      });

      await params.run({ fixtureRoot: fixtureRoot, environment: environment });
    },
  });
}

/**
 * A probe run over `environment` with the test platform, due ten seconds from now. No process
 * runs unless `runningProcesses` names one, and each cutoff left out is 0.
 */
export function buildTestProbeRun(params: TestProbeRunParams): ExploreProbeRun {
  return {
    environment: params.environment,
    platform: params.platform ?? buildTestProbePlatform(),
    runningProcesses:
      params.runningProcesses === undefined
        ? buildRunningCommandLines([])
        : params.runningProcesses,
    deadlineMs: Date.now() + TEST_PROBE_RUN_DURATION_MS,
    unusedCutoffMs: params.unusedCutoffMs ?? 0,
    staleCutoffMs: params.staleCutoffMs ?? 0,
  };
}

/** The probe run of `buildTestProbeRun` with the located `tool` the probe calls. */
export function buildTestProbeToolRun(
  params: TestProbeRunParams & { tool: LocatedTool },
): ExploreProbeToolRun {
  return { ...buildTestProbeRun(params), tool: params.tool };
}

/** The findings of a probe's answer; throws with the reason when the probe failed. */
export function getProbeFindings(
  result: Result<ExploreProbeFindings, { reason: string }>,
): ExploreProbeFindings {
  if (result.kind === 'failed') {
    throw new Error(`The probe failed: ${result.failure.reason}.`);
  }

  return result.value;
}

/** The units of the findings that are of `kind`, in their order. */
export function listUnitsOfKind<TKind extends ExploreUnit['kind']>(params: {
  findings: ExploreProbeFindings;
  kind: TKind;
}): ExploreUnitOfKind<TKind>[] {
  return params.findings.findings.flatMap((finding) =>
    isUnitOfKind(finding.unit, params.kind) ? [finding.unit] : [],
  );
}

/** The first unit of the findings that is of `kind`; throws when none is. */
export function getUnitOfKind<TKind extends ExploreUnit['kind']>(params: {
  findings: ExploreProbeFindings;
  kind: TKind;
}): ExploreUnitOfKind<TKind> {
  const [unit] = listUnitsOfKind(params);

  if (unit === undefined) {
    throw new Error(`No unit of the kind ${params.kind} was offered.`);
  }

  return unit;
}

function isUnitOfKind<TKind extends ExploreUnit['kind']>(
  unit: ExploreUnit,
  kind: TKind,
): unit is ExploreUnitOfKind<TKind> {
  return unit.kind === kind;
}
