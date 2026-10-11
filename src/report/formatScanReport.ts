import type { Advice, Candidate, SkipReason } from '../scan/candidate.js';
import type { ScanIssue } from '../scan/issue.js';
import type { ScanReport, SkippedItem } from '../scan/runScan.js';
import { formatSizeText } from './formatBytes.js';
import { formatCount } from './formatCount.js';

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
  overlapsEarlierCandidate: 'already covered by another item',
};

const issueReasonTexts: Record<ScanIssue['reason'], string> = {
  permissionDenied: 'permission denied',
  unexpected: 'unexpected error',
  commandFailed: 'a system command failed',
  walkStopped: 'search stopped at its time limit',
};

const fullDiskAccessLine =
  'Give your terminal Full Disk Access in System Settings > Privacy & Security to scan protected folders.';

export function formatScanReport(params: { report: ScanReport }): string[] {
  return [
    ...formatCandidateLines({ candidates: params.report.candidates }),
    ...formatAdviceBlock({ advice: params.report.advice }),
    ...formatSkippedBlock({ skipped: params.report.skipped }),
    ...formatIssueBlock({ issues: params.report.issues }),
  ];
}

function formatCandidateLines(params: { candidates: Candidate[] }): string[] {
  if (params.candidates.length === 0) {
    return ['Nothing to delete was found.'];
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

  return [
    `Found ${itemCountText}, ${totalSizeText} in total:`,
    ...params.candidates.flatMap((candidate, index) =>
      formatCandidateItemLines({ candidate: candidate, number: index + 1 }),
    ),
  ];
}

function formatCandidateItemLines(params: { candidate: Candidate; number: number }): string[] {
  const sizeText = formatSizeText(params.candidate);

  return [
    `${params.number}. ${sizeText} [${params.candidate.risk}] ${params.candidate.title}`,
    `   ${params.candidate.path}`,
    `   ${params.candidate.explanation} ${params.candidate.regeneration}`,
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
    `   ${params.item.path}`,
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

function formatIssueBlock(params: { issues: ScanIssue[] }): string[] {
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
    lines.push(fullDiskAccessLine);
  }

  return lines;
}

function formatIssueLine(params: { issue: ScanIssue }): string {
  const reasonText = issueReasonTexts[params.issue.reason];

  return `- ${params.issue.path}: ${reasonText} (${params.issue.detail})`;
}
