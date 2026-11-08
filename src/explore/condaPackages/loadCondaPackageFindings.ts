import { dirname } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type { ExploreFinding, UnitActivity } from '../exploreUnit.js';
import { formatCountText } from '../formatLimitTexts.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import { CONDA_CLEAN_DRY_RUN_PROBE } from './parseCondaCleanDryRun.js';

/** Asks `conda clean --dry-run --json` what its tarball and package cleans would remove. */
export async function loadCondaPackageFindings(
  run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  const plan = await loadProbeOutput({
    probe: CONDA_CLEAN_DRY_RUN_PROBE,
    tool: run.tool,
    environment: run.environment,
    deadlineMs: run.deadlineMs,
  });

  if (plan.kind === 'failed') {
    return plan;
  }

  const activity = decideUnitActivity({
    facts: { kind: 'conda' },
    processCommands: run.processCommands,
  });
  const findings: ExploreFinding[] = [];
  const firstTarballPath = plan.value.tarballPaths[0];
  const firstPackagePath = plan.value.packagePaths[0];

  if (firstTarballPath !== undefined) {
    findings.push({
      unit: { kind: 'condaTarballs', tool: run.tool, tarballPaths: plan.value.tarballPaths },
      title: 'conda package downloads',
      explanation:
        'The package files conda downloaded and already unpacked, which `conda clean --tarballs` removes.',
      regeneration: 'conda downloads a package again if it ever needs the file.',
      risk: 'safe',
      evidenceLines: buildCondaEvidenceLines({
        count: plan.value.tarballPaths.length,
        noun: 'file',
      }),
      displayPath: dirname(firstTarballPath),
      activity: activity,
    });
  }

  if (firstPackagePath !== undefined) {
    findings.push(
      buildCondaPackagesFinding({
        run: run,
        packagePaths: plan.value.packagePaths,
        displayPath: dirname(firstPackagePath),
        activity: activity,
      }),
    );
  }

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}

function buildCondaPackagesFinding(params: {
  run: ExploreProbeToolRun;
  packagePaths: AbsolutePath[];
  displayPath: string;
  activity: UnitActivity;
}): ExploreFinding {
  return {
    unit: { kind: 'condaPackages', tool: params.run.tool, packagePaths: params.packagePaths },
    title: 'Unused conda packages',
    explanation:
      'Unpacked packages that no conda environment links to, which `conda clean --packages` removes.',
    regeneration: 'conda downloads a package again when an environment installs it.',
    risk: 'review',
    evidenceLines: buildCondaEvidenceLines({ count: params.packagePaths.length, noun: 'folder' }),
    displayPath: params.displayPath,
    activity: params.activity,
  };
}

function buildCondaEvidenceLines(params: { count: number; noun: 'file' | 'folder' }): string[] {
  return [`conda's own dry run lists ${formatCountText(params)} to remove.`];
}
