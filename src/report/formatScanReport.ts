import type { ScanReport } from '../scan/runScan.js';
import type { VolumeSpace } from '../system/volumeSpace.js';
import type {
  AdviceItemView,
  CheckGroupView,
  ExploreView,
  ItemDetailLine,
  ItemDetailLineKind,
  ItemView,
  SectionView,
  SkippedView,
} from './buildScanView.js';
import { buildScanView } from './buildScanView.js';
import type { NoticeView } from './noticeView.js';
import type { ReportTexts } from './reportTexts.js';

/** What leads a detail line below its item, after the indent. */
const detailLinePrefixes: Record<ItemDetailLineKind, string> = {
  path: '',
  explanation: '',
  regeneration: '',
  evidence: '- ',
  command: 'Runs: ',
  advice: '',
};

/**
 * The scan as the CLI prints it: the summary, the sections with their numbered items, Explore,
 * the skipped items, and the notices. The CLI has no button, so a notice shows its lines only.
 */
export function formatScanReport(params: {
  report: ScanReport;
  texts: ReportTexts;
  homeDir: string;
  disk: VolumeSpace | null;
}): string[] {
  const view = buildScanView({
    report: params.report,
    fullDiskAccessHolder: 'terminal',
    texts: params.texts,
    homeDir: params.homeDir,
    disk: params.disk,
  });

  return [
    ...formatListBlockLines({ titleText: view.summary.titleText, lines: view.summary.lines }),
    ...view.sections.flatMap((section) => formatSectionLines({ section: section })),
    ...formatExploreLines({ explore: view.explore }),
    ...formatSeparatedBlockLines({ block: view.skipped }),
    ...view.notices.flatMap((notice) => formatSeparatedBlockLines({ block: notice })),
  ];
}

function formatSectionLines(params: { section: SectionView }): string[] {
  return [
    '',
    `${params.section.titleText} (${params.section.sizeText}):`,
    ...params.section.items.flatMap((item) => formatNumberedItemLines({ item: item })),
    ...formatCheckGroupLines({ checkGroup: params.section.checkGroup }),
  ];
}

function formatCheckGroupLines(params: { checkGroup: CheckGroupView | null }): string[] {
  if (params.checkGroup === null) {
    return [];
  }

  return [
    `${params.checkGroup.titleText}:`,
    ...params.checkGroup.items.flatMap((item) => formatNumberedItemLines({ item: item })),
  ];
}

/** The advice items carry no number, since no selection can name them. */
function formatExploreLines(params: { explore: ExploreView | null }): string[] {
  if (params.explore === null) {
    return [];
  }

  const lines = [
    '',
    `${params.explore.titleText}:`,
    params.explore.introText,
    ...params.explore.items.flatMap((item) => formatNumberedItemLines({ item: item })),
  ];

  if (params.explore.adviceGroup !== null) {
    lines.push(
      `${params.explore.adviceGroup.titleText}:`,
      ...params.explore.adviceGroup.items.flatMap((item) =>
        formatItemLines({ leadText: '-', item: item }),
      ),
    );
  }

  return lines;
}

function formatNumberedItemLines(params: { item: ItemView }): string[] {
  return formatItemLines({ leadText: `${params.item.number}.`, item: params.item });
}

/** The lead is the number of a selectable item, or `-` for an advice item. */
function formatItemLines(params: { leadText: string; item: ItemView | AdviceItemView }): string[] {
  return [
    `${params.leadText} ${params.item.sizeText} [${params.item.riskText}] ${params.item.title}`,
    ...params.item.detailLines.map((line) => formatDetailLine({ line: line })),
  ];
}

function formatDetailLine(params: { line: ItemDetailLine }): string {
  return `   ${detailLinePrefixes[params.line.kind]}${params.line.text}`;
}

/** The skipped items or a notice: a list block after a blank line, nothing for `null`. */
function formatSeparatedBlockLines(params: { block: SkippedView | NoticeView | null }): string[] {
  if (params.block === null) {
    return [];
  }

  return [
    '',
    ...formatListBlockLines({ titleText: params.block.titleText, lines: params.block.lines }),
  ];
}

/** A title alone, or a title with a colon and one `- ` line per entry below it. */
function formatListBlockLines(params: { titleText: string; lines: string[] }): string[] {
  if (params.lines.length === 0) {
    return [params.titleText];
  }

  return [`${params.titleText}:`, ...params.lines.map((line) => `- ${line}`)];
}
