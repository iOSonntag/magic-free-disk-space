import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { toNonEmpty } from '../../system/nonEmptyList.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { BrowserFamily } from '../explorePlatform.js';
import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFinding, ExploreFoundFile } from '../exploreUnit.js';
import { formatCountText, formatIsoDay } from '../formatLimitTexts.js';
import { loadExploreDirectoryEntries } from '../loadExploreRead.js';
import type { DownloadsFileKind } from './downloadsFiles.js';
import {
  BROWSER_FAMILIES,
  buildDownloadsActivityFacts,
  getDownloadsFileKind,
  loadLatestModified,
} from './downloadsFiles.js';

const INCOMPLETE_DOWNLOADS_TITLES: Record<BrowserFamily, string> = {
  chromium: 'Unfinished downloads of Chrome and other Chromium browsers',
  firefox: 'Unfinished downloads of Firefox',
  safari: 'Unfinished downloads of Safari',
};

/**
 * Finds the installers and the partial downloads at the top of Downloads that nothing changed
 * since the stale cutoff: one unit of the installers, and one of each browser family's partial
 * downloads. A hidden entry and a symbolic link are left alone; so is an entry whose newest change
 * is not known by the deadline, which leaves the findings incomplete. Fails on an entry it cannot
 * read; `placeMissing` without a Downloads folder.
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
  const incomplete: Record<BrowserFamily, ExploreFoundFile[]> = {
    chromium: [],
    firefox: [],
    safari: [],
  };
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

    switch (fileKind.kind) {
      case 'installer':
        installers.push(found);
        break;
      case 'incomplete':
        incomplete[fileKind.browserFamily].push(found);
        break;
    }
  }

  const findings = [
    buildDownloadsFinding({
      run: run,
      fileKind: { kind: 'installer' },
      folderPath: folderPath,
      found: installers,
    }),
    ...BROWSER_FAMILIES.map((browserFamily) =>
      buildDownloadsFinding({
        run: run,
        fileKind: { kind: 'incomplete', browserFamily: browserFamily },
        folderPath: folderPath,
        found: incomplete[browserFamily],
      }),
    ),
  ].filter((finding) => finding !== null);

  return { kind: 'succeeded', value: { findings: findings, isComplete: isComplete } };
}

function buildDownloadsFinding(params: {
  run: ExploreProbeRun;
  fileKind: DownloadsFileKind;
  folderPath: AbsolutePath;
  found: ExploreFoundFile[];
}): ExploreFinding | null {
  const foundFiles = toNonEmpty(params.found);

  if (foundFiles === null) {
    return null;
  }

  const evidenceLine = `${formatCountText({ count: foundFiles.length, noun: 'file' })} unchanged since before ${formatIsoDay(params.run.staleCutoffMs)}.`;
  const activity = decideUnitActivity({
    facts: buildDownloadsActivityFacts({
      fileKind: params.fileKind,
      environment: params.run.environment,
      platform: params.run.platform,
    }),
    processCommands: params.run.processCommands,
  });

  switch (params.fileKind.kind) {
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
        evidenceLines: [evidenceLine],
        displayPath: params.folderPath,
        activity: activity,
      };
    case 'incomplete':
      return {
        unit: {
          kind: 'downloadsIncomplete',
          folderPath: params.folderPath,
          browserFamily: params.fileKind.browserFamily,
          cutoffMs: params.run.staleCutoffMs,
          foundFiles: foundFiles,
        },
        title: INCOMPLETE_DOWNLOADS_TITLES[params.fileKind.browserFamily],
        explanation:
          'Partial downloads the browser left in Downloads and nothing wrote to for the stale period, so it does not resume them.',
        regeneration: 'Start the download again in the browser.',
        risk: 'safe',
        evidenceLines: [evidenceLine],
        displayPath: params.folderPath,
        activity: activity,
      };
  }
}
