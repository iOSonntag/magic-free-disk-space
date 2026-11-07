import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExploreProbePlatform, ExploreProbeRun } from '../../src/explore/exploreProbe.js';
import type { ExploreProbeFindings, ExploreUnit } from '../../src/explore/exploreUnit.js';
import type { Result } from '../../src/result.js';
import type { FixtureRoot } from './fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, loadTestEnvironment } from './fixtureRoot.js';
import { buildTestProbePlatform } from './probePlatformFixtures.js';

/** One day in milliseconds, for the times and cutoffs of the fixtures. */
export const DAY_MS = 86_400_000;

/** How long a test probe run may take before its deadline. */
const TEST_PROBE_RUN_DURATION_MS = 10_000;

/** A temporary home of a test, with the environment over it. */
export type FixtureHome = { fixtureRoot: FixtureRoot; environment: Environment };

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
  const fixtureRoot = await createFixtureRoot();

  try {
    const environment = await loadTestEnvironment({
      fixtureRoot: fixtureRoot,
      nowMs: params.nowMs,
    });

    await params.run({ fixtureRoot: fixtureRoot, environment: environment });
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

/**
 * A probe run over `environment` with the test platform, due ten seconds from now. No process
 * runs unless `processCommands` names one, and both cutoffs are `cutoffMs`, 0 when it is left out.
 */
export function buildTestProbeRun(params: {
  environment: Environment;
  processCommands?: string[] | null;
  platform?: ExploreProbePlatform;
  cutoffMs?: number;
}): ExploreProbeRun {
  const cutoffMs = params.cutoffMs ?? 0;

  return {
    environment: params.environment,
    platform: params.platform ?? buildTestProbePlatform(),
    processCommands: params.processCommands === undefined ? [] : params.processCommands,
    deadlineMs: Date.now() + TEST_PROBE_RUN_DURATION_MS,
    unusedCutoffMs: cutoffMs,
    staleCutoffMs: cutoffMs,
  };
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
export function findUnitOfKind<TKind extends ExploreUnit['kind']>(params: {
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
