import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFinding, ExploreFoundFile, ExploreFoundFiles } from '../exploreUnit.js';
import { loadExploreDirectoryEntries } from '../loadExploreRead.js';
import type { DownloadsFileKind } from './downloadsFiles.js';
import {
  buildDownloadsActivityFacts,
  getDownloadsFileKind,
  loadLatestModified,
} from './downloadsFiles.js';

/**
 * Finds the installers and the partial downloads at the top of Downloads that nothing changed
 * since the stale cutoff, one unit for each kind. A hidden entry and a symbolic link are left
 * alone; so is an entry whose newest change is not known by the deadline, which leaves the
 * findings incomplete. Fails on an entry it cannot read; `placeMissing` without a Downloads folder.
 */
export async function loadDownloadsInstallerFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const folderPath = joinAbsolutePath({
    rules: run.environment.pathRules,
    parentPath: run.environment.homeDir,
    names: run.platform.explore.downloadsRoot,
  });
  const entries = await loadExploreDirectoryEntries({
    path: folderPath,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'failed', failure: { reason: 'placeMissing' } };
  }

  const installers: ExploreFoundFile[] = [];
  const incomplete: ExploreFoundFile[] = [];
  let isComplete = true;

  for (const entry of entries.value) {
    const fileKind = getDownloadsFileKind({ name: entry.name });

    if (
      fileKind === null ||
      entry.name.startsWith('.') ||
      (entry.kind !== 'file' && entry.kind !== 'directory')
    ) {
      continue;
    }

    const path = joinAbsolutePath({
      rules: run.environment.pathRules,
      parentPath: folderPath,
      names: [entry.name],
    });
    const latest = await loadLatestModified({
      path: path,
      platform: run.platform,
      deadlineMs: run.deadlineMs,
    });

    if (latest.kind === 'failed') {
      return latest;
    }

    if (latest.value === null) {
      continue;
    }

    if (latest.value.kind === 'unknown') {
      isComplete = false;

      continue;
    }

    if (latest.value.modifiedMs >= run.staleCutoffMs) {
      continue;
    }

    const found = { path: path, modifiedMs: latest.value.modifiedMs };

    switch (fileKind) {
      case 'installer':
        installers.push(found);
        break;
      case 'incomplete':
        incomplete.push(found);
        break;
    }
  }

  const findings = [
    buildDownloadsFinding({
      run: run,
      kind: 'installer',
      folderPath: folderPath,
      found: installers,
    }),
    buildDownloadsFinding({
      run: run,
      kind: 'incomplete',
      folderPath: folderPath,
      found: incomplete,
    }),
  ].filter((finding) => finding !== null);

  return { kind: 'succeeded', value: { findings: findings, isComplete: isComplete } };
}

function buildDownloadsFinding(params: {
  run: ExploreProbeRun;
  kind: DownloadsFileKind;
  folderPath: AbsolutePath;
  found: ExploreFoundFile[];
}): ExploreFinding | null {
  const [firstFile, ...restFiles] = params.found;

  if (firstFile === undefined) {
    return null;
  }

  const foundFiles: ExploreFoundFiles = [firstFile, ...restFiles];
  const staleDate = new Date(params.run.staleCutoffMs).toISOString().slice(0, 10);
  const countText = foundFiles.length === 1 ? '1 file' : `${foundFiles.length} files`;
  const activity = decideUnitActivity({
    facts: buildDownloadsActivityFacts({
      kind: params.kind,
      environment: params.run.environment,
      platform: params.run.platform,
    }),
    processCommands: params.run.processCommands,
  });

  switch (params.kind) {
    case 'installer':
      return {
        unit: {
          kind: 'downloadsInstallers',
          folderPath: params.folderPath,
          cutoffMs: params.run.staleCutoffMs,
          foundFiles: foundFiles,
        },
        title: 'Old installers in Downloads',
        explanation:
          'Disk images and installer packages in Downloads that nothing changed for the stale period. Once their app or update is installed, they are no longer needed.',
        regeneration: 'Download it again from its maker if you need it.',
        risk: 'careful',
        evidenceLines: [`${countText} unchanged since before ${staleDate}.`],
        displayPath: params.folderPath,
        activity: activity,
      };
    case 'incomplete':
      return {
        unit: {
          kind: 'downloadsIncomplete',
          folderPath: params.folderPath,
          cutoffMs: params.run.staleCutoffMs,
          foundFiles: foundFiles,
        },
        title: 'Unfinished downloads in Downloads',
        explanation:
          'Partial downloads a browser left behind that nothing wrote to for the stale period, so no browser resumes them.',
        regeneration: 'Start the download again in the browser.',
        risk: 'safe',
        evidenceLines: [`${countText} unchanged since before ${staleDate}.`],
        displayPath: params.folderPath,
        activity: activity,
      };
  }
}
