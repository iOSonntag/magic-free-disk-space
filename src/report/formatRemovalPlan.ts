import type { RefusedRemoval, RemovalPlan } from '../delete/planRemoval.js';
import type { RefusalReason } from '../delete/validateRemoval.js';
import type { Candidate } from '../scan/candidate.js';
import { formatSizeText, formatTotalSizeText } from './formatBytes.js';
import { formatToolCommandText } from './formatCandidateCommandText.js';
import { formatCandidateItemText } from './formatCandidateItemText.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';

const refusalReasonTexts: Record<RefusalReason, string> = {
  neverRisk: 'marked never-delete',
  protectedRoot: 'a protected folder',
  outsideAllowedRoot: 'outside the folders this tool may delete in',
  symbolicLink: 'a symbolic link',
  unsupportedKind: 'not a file or folder',
};

export function formatRemovalPlan(params: { plan: RemovalPlan }): string[] {
  return [
    ...formatApprovedLines({ approved: params.plan.approved }),
    ...formatRefusedBlock({ refused: params.plan.refused }),
  ];
}

function formatApprovedLines(params: { approved: Candidate[] }): string[] {
  if (params.approved.length === 0) {
    return ['Nothing of the selection can be deleted.'];
  }

  const totalSizeText = formatTotalSizeText({ items: params.approved });
  const subjectText =
    params.approved.length === 1 ? 'This item' : `These ${params.approved.length} items`;
  const evictCount = params.approved.filter(
    (candidate) => candidate.removal.kind === 'evictUnitFiles',
  ).length;

  return [
    formatApprovedHeader({
      subjectText: subjectText,
      totalSizeText: totalSizeText,
      evictCount: evictCount,
      approvedCount: params.approved.length,
    }),
    ...params.approved.flatMap((candidate) => formatApprovedItemLines({ candidate: candidate })),
  ];
}

/** An evicted file leaves only this Mac, so a plan that evicts never calls it deleted. */
function formatApprovedHeader(params: {
  subjectText: string;
  totalSizeText: string;
  evictCount: number;
  approvedCount: number;
}): string {
  if (params.evictCount === 0) {
    return `${params.subjectText} will be deleted permanently, ${params.totalSizeText} in total:`;
  }

  if (params.evictCount === params.approvedCount) {
    return `${params.subjectText} will be removed from this Mac, ${params.totalSizeText} in total; iCloud Drive keeps the files:`;
  }

  return `${params.subjectText} will be removed from this Mac, ${params.totalSizeText} in total; iCloud Drive keeps the evicted files, and the rest is deleted permanently:`;
}

/** An item that goes other than as a plain delete says how below its line. */
function formatApprovedItemLines(params: { candidate: Candidate }): string[] {
  return [
    `- ${formatSizeText(params.candidate)} ${formatCandidateItemText({ candidate: params.candidate })}`,
    ...formatRemovalWayLines({ candidate: params.candidate }),
  ];
}

/**
 * A tool item names its command; an engine item its engine, whose disk image gives the space back
 * only later; an evict item that iCloud Drive keeps its files.
 */
function formatRemovalWayLines(params: { candidate: Candidate }): string[] {
  switch (params.candidate.removal.kind) {
    case 'deletePaths':
    case 'deleteUnitPaths':
    case 'emptyRecycleBin':
      return [];
    case 'runTool':
      return [`   by running: ${formatToolCommandText({ unit: params.candidate.removal.unit })}`];
    case 'callEngine':
      return [
        `   by ${formatDisplayText({ text: params.candidate.removal.unit.engineName })}, whose disk image gives the space back later`,
      ];
    case 'evictUnitFiles':
      return ['   evicted from this Mac; iCloud Drive keeps the files'];
  }
}

function formatRefusedBlock(params: { refused: RefusedRemoval[] }): string[] {
  if (params.refused.length === 0) {
    return [];
  }

  return [
    '',
    `Refused ${formatCount({ count: params.refused.length, singular: 'selected item', plural: 'selected items' })}:`,
    ...params.refused.map((item) => formatRefusedLine({ item: item })),
  ];
}

function formatRefusedLine(params: { item: RefusedRemoval }): string {
  const reasonText = refusalReasonTexts[params.item.reason];

  return `- ${params.item.number}. ${formatDisplayText({ text: params.item.path })}: ${reasonText}`;
}
