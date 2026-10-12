import type { RefusedRemoval, RemovalPlan } from '../delete/planRemoval.js';
import type { RefusalReason } from '../delete/validateRemoval.js';
import type { Candidate } from '../scan/candidate.js';
import { formatSizeText } from './formatBytes.js';
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

  const totalSizeText = formatSizeText({
    allocatedBytes: params.approved.reduce((sum, candidate) => sum + candidate.allocatedBytes, 0),
    isComplete: params.approved.every((candidate) => candidate.isComplete),
  });
  const subjectText =
    params.approved.length === 1 ? 'This item' : `These ${params.approved.length} items`;

  return [
    `${subjectText} will be deleted permanently, ${totalSizeText} in total:`,
    ...params.approved.map(
      (candidate) =>
        `- ${formatSizeText(candidate)} ${formatDisplayText({ text: candidate.path })}`,
    ),
  ];
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
