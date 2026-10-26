import type { Risk } from '../catalog/catalog.js';
import type { Advice, Candidate, SkipReason } from '../scan/candidate.js';
import type { ScanIssue } from '../scan/issue.js';
import type { ScanReport, SkippedItem } from '../scan/runScan.js';
import { formatSizeText } from './formatBytes.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';

/** A ranked candidate as a person sees it: every text is safe to show. */
export type CandidateView = {
  number: number;
  title: string;
  path: string;
  risk: Risk;
  explanation: string;
  regeneration: string;
  sizeText: string;
};

/** Who needs Full Disk Access: the terminal that runs the CLI, or the app. */
type FullDiskAccessHolder = 'terminal' | 'app';

const skipReasonTexts: Record<SkipReason, string> = {
  belowSizeThreshold: 'too small to matter',
  symbolicLink: 'symbolic link, never followed',
  systemOwned: 'owned by macOS',
  ownerRunning: 'its app is running',
  runningUnknown: 'could not check whether its app runs',
  recentActivity: 'changed recently',
  activityUnknown: 'could not tell when it last changed',
  recentUse: 'used recently',
  useUnknown: 'could not tell when it was last used',
  ownerInstalled: 'its app is installed',
  notBundleId: 'no app identifier',
  installedAppsUnknown: 'could not read every installed app',
  holdsOtherVolume: 'holds another mounted disk',
  overlapsEarlierCandidate: 'already covered by another item',
};

const issueReasonTexts: Record<ScanIssue['reason'], string> = {
  permissionDenied: 'permission denied',
  unexpected: 'unexpected error',
  commandFailed: 'a system command failed',
  walkStopped: 'search stopped at its time limit',
};

const fullDiskAccessHolderTexts: Record<FullDiskAccessHolder, string> = {
  terminal: 'your terminal',
  app: 'this app',
};

export function formatScanReport(params: { report: ScanReport }): string[] {
  return [
    ...formatCandidateLines({ candidates: params.report.candidates }),
    ...formatScanReportNotes({ report: params.report, fullDiskAccessHolder: 'terminal' }),
  ];
}

/** "Nothing to delete was found." or the count and total size of the candidates. */
export function formatCandidateSummary(params: { candidates: Candidate[] }): string {
  if (params.candidates.length === 0) {
    return 'Nothing to delete was found.';
  }

  const totalSizeText = formatSizeText({
    allocatedBytes: params.candidates.reduce((sum, candidate) => sum + candidate.allocatedBytes, 0),
    isComplete: params.candidates.every((candidate) => candidate.isComplete),
  });
  const itemCountText = formatCount({
    count: params.candidates.length,
    singular: 'item',
    plural: 'items',
  });

  return `Found ${itemCountText}, ${totalSizeText} in total`;
}

export function formatCandidateView(params: {
  candidate: Candidate;
  number: number;
}): CandidateView {
  return {
    number: params.number,
    title: formatDisplayText({ text: params.candidate.title }),
    path: formatDisplayText({ text: params.candidate.path }),
    risk: params.candidate.risk,
    explanation: params.candidate.explanation,
    regeneration: params.candidate.regeneration,
    sizeText: formatSizeText(params.candidate),
  };
}

/** The blocks after the candidates: the advice, the skipped items, and the unreadable places. */
export function formatScanReportNotes(params: {
  report: ScanReport;
  fullDiskAccessHolder: FullDiskAccessHolder;
}): string[] {
  return [
    ...formatAdviceBlock({ advice: params.report.advice }),
    ...formatSkippedBlock({ skipped: params.report.skipped }),
    ...formatIssueBlock({
      issues: params.report.issues,
      fullDiskAccessHolder: params.fullDiskAccessHolder,
    }),
  ];
}

function formatCandidateLines(params: { candidates: Candidate[] }): string[] {
  const summary = formatCandidateSummary({ candidates: params.candidates });

  if (params.candidates.length === 0) {
    return [summary];
  }

  return [
    `${summary}:`,
    ...params.candidates.flatMap((candidate, index) =>
      formatCandidateItemLines({
        view: formatCandidateView({ candidate: candidate, number: index + 1 }),
      }),
    ),
  ];
}

function formatCandidateItemLines(params: { view: CandidateView }): string[] {
  return [
    `${params.view.number}. ${params.view.sizeText} [${params.view.risk}] ${params.view.title}`,
    `   ${params.view.path}`,
    `   ${params.view.explanation} ${params.view.regeneration}`,
  ];
}

function formatAdviceBlock(params: { advice: Advice[] }): string[] {
  if (params.advice.length === 0) {
    return [];
  }

  return [
    '',
    'Handle these yourself; this tool never deletes them:',
    ...params.advice.flatMap((item) => formatAdviceItemLines({ item: item })),
  ];
}

function formatAdviceItemLines(params: { item: Advice }): string[] {
  const sizeText = formatSizeText(params.item);

  return [
    `- ${sizeText} [${params.item.risk}] ${params.item.title}`,
    `   ${formatDisplayText({ text: params.item.path })}`,
    `   ${params.item.advice}`,
  ];
}

function formatSkippedBlock(params: { skipped: SkippedItem[] }): string[] {
  if (params.skipped.length === 0) {
    return [];
  }

  return [
    '',
    `Skipped ${formatCount({ count: params.skipped.length, singular: 'item', plural: 'items' })}:`,
    ...formatSkipReasonLines({ skipped: params.skipped }),
  ];
}

function formatSkipReasonLines(params: { skipped: SkippedItem[] }): string[] {
  const lines: string[] = [];

  for (const [reason, text] of Object.entries(skipReasonTexts)) {
    const count = params.skipped.filter((item) => item.reason === reason).length;

    if (count > 0) {
      lines.push(`- ${text}: ${count}`);
    }
  }

  return lines;
}

function formatIssueBlock(params: {
  issues: ScanIssue[];
  fullDiskAccessHolder: FullDiskAccessHolder;
}): string[] {
  if (params.issues.length === 0) {
    return [];
  }

  const lines = [
    '',
    `Could not read ${formatCount({ count: params.issues.length, singular: 'place', plural: 'places' })}:`,
    ...params.issues.map((issue) => formatIssueLine({ issue: issue })),
  ];
  const hasPermissionDenied = params.issues.some((issue) => issue.reason === 'permissionDenied');

  if (hasPermissionDenied) {
    lines.push(
      `Give ${fullDiskAccessHolderTexts[params.fullDiskAccessHolder]} Full Disk Access in System Settings > Privacy & Security to scan protected folders.`,
    );
  }

  return lines;
}

function formatIssueLine(params: { issue: ScanIssue }): string {
  const reasonText = issueReasonTexts[params.issue.reason];

  return `- ${formatDisplayText({ text: params.issue.path })}: ${reasonText} (${params.issue.detail})`;
}
