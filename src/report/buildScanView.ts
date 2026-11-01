import type { Risk } from '../catalog/catalog.js';
import { isRemovableRisk } from '../delete/validateRemoval.js';
import type { Advice, Candidate, SkipReason } from '../scan/candidate.js';
import type { ScanIssue } from '../scan/issue.js';
import type {
  CandidatePlace,
  CandidatePlaceSection,
  ConsumerSection,
} from '../scan/placeCandidate.js';
import { CONSUMER_SECTION_ORDER, placeCandidate } from '../scan/placeCandidate.js';
import type { ScanReport, SkippedItem } from '../scan/runScan.js';
import type { ToolDistrustDetail } from '../tools/decideToolTrust.js';
import { formatSizeText, formatTotalSizeText } from './formatBytes.js';
import { formatCandidateCommandText } from './formatCandidateCommandText.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';
import { formatToolFailureFirstStderrLine, formatToolFailureSummary } from './formatToolFailure.js';
import type { NoticeView } from './noticeView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from './noticeView.js';

/** A scan as the app and the CLI show it, top to bottom; every text is formatted and safe to show. */
export type ScanView = {
  summary: SummaryView;
  /** Only the sections that hold an item, in their order. */
  sections: SectionView[];
  /** `null` when the scan found neither an Explore item nor advice. */
  explore: ExploreView | null;
  /** The numbers "Select safe" picks. */
  safeNumbers: number[];
  /** `null` when nothing was skipped. */
  skipped: SkippedView | null;
  notices: NoticeView[];
};

type SummaryView = { titleText: string; lines: string[] };

export type SectionView = {
  titleText: string;
  sizeText: string;
  /** Open when the section holds a safe item. */
  isInitiallyExpanded: boolean;
  /** The safe items, shown open. */
  items: ItemView[];
  /** `null` when every item of the section is safe. */
  checkGroup: CheckGroupView | null;
};

/** The items of a section that are not safe, collapsed under "Check before deleting". */
export type CheckGroupView = { titleText: string; items: ItemView[] };

export type ExploreView = {
  titleText: string;
  introText: string;
  items: ItemView[];
  /** `null` when the scan gave no advice. */
  adviceGroup: AdviceGroupView | null;
};

/** What the tool never removes: places the person handles with the owning tool. */
type AdviceGroupView = { titleText: string; items: AdviceItemView[] };

/** A selectable item; `number` is what the selection names. */
export type ItemView = {
  number: number;
  title: string;
  /** For the colour of the item; `riskText` is what shows. */
  risk: Risk;
  riskText: string;
  sizeText: string;
  detailLines: ItemDetailLine[];
};

/** An advice item: never selectable, so it has no number. */
export type AdviceItemView = {
  title: string;
  risk: Risk;
  riskText: string;
  sizeText: string;
  detailLines: ItemDetailLine[];
};

export type ItemDetailLineKind =
  | 'path'
  | 'explanation'
  | 'regeneration'
  | 'evidence'
  | 'command'
  | 'advice';

export type ItemDetailLine = { kind: ItemDetailLineKind; text: string };

export type SkippedView = { titleText: string; lines: string[] };

/** Who needs Full Disk Access: the terminal that runs the CLI, or the app. */
type FullDiskAccessHolder = 'terminal' | 'app';

/** A ranked candidate with its number already in its view. */
type PlacedItem = { candidate: Candidate; place: CandidatePlace; view: ItemView };

type SectionPlacedItem = PlacedItem & { place: CandidatePlaceSection };

/** The parts of the summary, in the order its lines show. */
type SummaryPart = 'safe' | 'check' | 'explore';

const CHECK_GROUP_TITLE_TEXT = 'Check before deleting';

const EXPLORE_TITLE_TEXT = 'Explore';

const EXPLORE_INTRO_TEXT =
  'Their own tools remove these, or the folder shown is deleted where a tool has no command for it. They are never selected for you; read the reasons first.';

const ADVICE_GROUP_TITLE_TEXT = 'Handle these yourself; this tool never deletes them';

const sectionTitleTexts: Record<ConsumerSection, string> = {
  caches: 'Caches',
  developerTools: 'Developer tools',
  apps: 'Apps',
  largeFiles: 'Large files',
  trash: 'Trash',
};

const riskTexts: Record<Risk, string> = {
  safe: 'safe',
  review: 'review',
  careful: 'careful',
  never: 'never',
};

const summaryPartTexts: Record<SummaryPart, string> = {
  safe: 'safe to free',
  check: 'to check before deleting',
  explore: 'in Explore',
};

const skipReasonTexts: Record<SkipReason, string> = {
  belowSizeThreshold: 'too small to matter',
  symbolicLink: 'symbolic link, never followed',
  systemOwned: 'owned by macOS',
  ownerRunning: 'its app or tool is running',
  runningUnknown: 'could not check whether its app or tool runs',
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
  privacyDenied: 'blocked by macOS privacy protection',
  permissionDenied: 'permission denied',
  unexpected: 'unexpected error',
  commandFailed: 'a system command failed',
  walkStopped: 'search stopped at its time limit',
  toolFailed: 'the tool failed',
  toolUntrusted: 'the tool is not trusted, never run',
};

const toolDistrustDetailTexts: Record<ToolDistrustDetail, string> = {
  foreignOwner: 'owned by another user',
  writableByOthers: 'others can change it',
  notExecutableFile: 'not an executable file',
};

/** Issues of a tool that could not be asked are listed apart from the places that could not be read. */
const issueNoticeKinds: Record<ScanIssue['reason'], 'place' | 'tool'> = {
  privacyDenied: 'place',
  permissionDenied: 'place',
  unexpected: 'place',
  commandFailed: 'place',
  walkStopped: 'place',
  toolFailed: 'tool',
  toolUntrusted: 'tool',
};

const fullDiskAccessHolderTexts: Record<FullDiskAccessHolder, string> = {
  terminal: 'your terminal',
  app: 'this app',
};

/**
 * The scan as the app and the CLI show it. Walks the candidates in their rank, so an item's
 * number is its rank, and puts each where `placeCandidate` says; every text is safe to show.
 */
export function buildScanView(params: {
  report: ScanReport;
  fullDiskAccessHolder: FullDiskAccessHolder;
}): ScanView {
  const placedItems = params.report.candidates.map(
    (candidate, index): PlacedItem => ({
      candidate: candidate,
      place: placeCandidate(candidate),
      view: buildItemView({ candidate: candidate, number: index + 1 }),
    }),
  );

  return {
    summary: buildSummaryView({ placedItems: placedItems }),
    sections: buildSectionViews({ placedItems: placedItems }),
    explore: buildExploreView({ placedItems: placedItems, advice: params.report.advice }),
    safeNumbers: params.report.safeNumbers,
    skipped: buildSkippedView({ skipped: params.report.skipped }),
    notices: buildIssueNotices({
      issues: params.report.issues,
      fullDiskAccessHolder: params.fullDiskAccessHolder,
    }),
  };
}

/** The total of every candidate, then one line per part of the summary that holds an item. */
function buildSummaryView(params: { placedItems: PlacedItem[] }): SummaryView {
  if (params.placedItems.length === 0) {
    return { titleText: 'Nothing to delete was found.', lines: [] };
  }

  const itemCountText = formatCount({
    count: params.placedItems.length,
    singular: 'item',
    plural: 'items',
  });
  const totalSizeText = formatTotalSizeText({
    items: params.placedItems.map((item) => item.candidate),
  });

  return {
    titleText: `Found ${itemCountText}, ${totalSizeText} in total`,
    lines: formatSummaryLines({ placedItems: params.placedItems }),
  };
}

function formatSummaryLines(params: { placedItems: PlacedItem[] }): string[] {
  const lines: string[] = [];

  for (const [part, text] of Object.entries(summaryPartTexts)) {
    const partCandidates = params.placedItems.flatMap((item) =>
      decideSummaryPart({ item: item }) === part ? [item.candidate] : [],
    );

    if (partCandidates.length > 0) {
      lines.push(`${formatTotalSizeText({ items: partCandidates })} ${text}`);
    }
  }

  return lines;
}

/** `null` for a `never` item: the summary names only space the tool can free. */
function decideSummaryPart(params: { item: PlacedItem }): SummaryPart | null {
  switch (params.item.place.kind) {
    case 'explore':
      return 'explore';
    case 'section':
      if (params.item.place.group === 'safe') {
        return 'safe';
      }

      if (!isRemovableRisk(params.item.candidate.risk)) {
        return null;
      }

      return 'check';
  }
}

/** Only the sections that hold an item, in their order. */
function buildSectionViews(params: { placedItems: PlacedItem[] }): SectionView[] {
  return CONSUMER_SECTION_ORDER.flatMap((section) => {
    const sectionItems = params.placedItems.flatMap((item): SectionPlacedItem[] =>
      item.place.kind === 'section' && item.place.section === section
        ? [{ candidate: item.candidate, place: item.place, view: item.view }]
        : [],
    );

    if (sectionItems.length === 0) {
      return [];
    }

    return [buildSectionView({ section: section, sectionItems: sectionItems })];
  });
}

function buildSectionView(params: {
  section: ConsumerSection;
  sectionItems: SectionPlacedItem[];
}): SectionView {
  const safeItems = params.sectionItems.flatMap((item) =>
    item.place.group === 'safe' ? [item.view] : [],
  );
  const checkItems = params.sectionItems.flatMap((item) =>
    item.place.group === 'check' ? [item.view] : [],
  );

  return {
    titleText: sectionTitleTexts[params.section],
    sizeText: formatTotalSizeText({ items: params.sectionItems.map((item) => item.candidate) }),
    isInitiallyExpanded: safeItems.length > 0,
    items: safeItems,
    checkGroup:
      checkItems.length === 0 ? null : { titleText: CHECK_GROUP_TITLE_TEXT, items: checkItems },
  };
}

/** Every advice item lands here, since advice is what the tool never removes. */
function buildExploreView(params: {
  placedItems: PlacedItem[];
  advice: Advice[];
}): ExploreView | null {
  const items = params.placedItems.flatMap((item) =>
    item.place.kind === 'explore' ? [item.view] : [],
  );

  if (items.length === 0 && params.advice.length === 0) {
    return null;
  }

  return {
    titleText: EXPLORE_TITLE_TEXT,
    introText: EXPLORE_INTRO_TEXT,
    items: items,
    adviceGroup: buildAdviceGroupView({ advice: params.advice }),
  };
}

function buildAdviceGroupView(params: { advice: Advice[] }): AdviceGroupView | null {
  if (params.advice.length === 0) {
    return null;
  }

  return {
    titleText: ADVICE_GROUP_TITLE_TEXT,
    items: params.advice.map((item) => buildAdviceItemView({ advice: item })),
  };
}

function buildItemView(params: { candidate: Candidate; number: number }): ItemView {
  return {
    number: params.number,
    title: formatDisplayText({ text: params.candidate.title }),
    risk: params.candidate.risk,
    riskText: riskTexts[params.candidate.risk],
    sizeText: formatSizeText(params.candidate),
    detailLines: buildItemDetailLines({ candidate: params.candidate }),
  };
}

/** The path, the explanation, the regeneration, each evidence line, and a tool item's command. */
function buildItemDetailLines(params: { candidate: Candidate }): ItemDetailLine[] {
  const evidenceLines = params.candidate.origin === 'explore' ? params.candidate.evidenceLines : [];
  const lines = [
    buildDetailLine({ kind: 'path', text: params.candidate.path }),
    buildDetailLine({ kind: 'explanation', text: params.candidate.explanation }),
    buildDetailLine({ kind: 'regeneration', text: params.candidate.regeneration }),
    ...evidenceLines.map((line) => buildDetailLine({ kind: 'evidence', text: line })),
  ];
  const commandText = formatCandidateCommandText({ candidate: params.candidate });

  if (commandText !== null) {
    lines.push({ kind: 'command', text: commandText });
  }

  return lines;
}

function buildAdviceItemView(params: { advice: Advice }): AdviceItemView {
  return {
    title: formatDisplayText({ text: params.advice.title }),
    risk: params.advice.risk,
    riskText: riskTexts[params.advice.risk],
    sizeText: formatSizeText(params.advice),
    detailLines: [
      buildDetailLine({ kind: 'path', text: params.advice.path }),
      buildDetailLine({ kind: 'explanation', text: params.advice.explanation }),
      buildDetailLine({ kind: 'advice', text: params.advice.advice }),
    ],
  };
}

function buildDetailLine(params: { kind: ItemDetailLineKind; text: string }): ItemDetailLine {
  return { kind: params.kind, text: formatDisplayText({ text: params.text }) };
}

function buildSkippedView(params: { skipped: SkippedItem[] }): SkippedView | null {
  if (params.skipped.length === 0) {
    return null;
  }

  const itemCountText = formatCount({
    count: params.skipped.length,
    singular: 'item',
    plural: 'items',
  });

  return {
    titleText: `Skipped ${itemCountText}`,
    lines: formatSkipReasonLines({ skipped: params.skipped }),
  };
}

/** One line per reason that occurs, in the order of the reason table. */
function formatSkipReasonLines(params: { skipped: SkippedItem[] }): string[] {
  const lines: string[] = [];

  for (const [reason, text] of Object.entries(skipReasonTexts)) {
    const count = params.skipped.filter((item) => item.reason === reason).length;

    if (count > 0) {
      lines.push(`${text}: ${count}`);
    }
  }

  return lines;
}

/** The places the scan could not read, then the tools it could not ask; each only when it occurred. */
function buildIssueNotices(params: {
  issues: ScanIssue[];
  fullDiskAccessHolder: FullDiskAccessHolder;
}): NoticeView[] {
  const placeIssues = params.issues.filter((issue) => issueNoticeKinds[issue.reason] === 'place');
  const toolIssues = params.issues.filter((issue) => issueNoticeKinds[issue.reason] === 'tool');

  return [
    ...buildPlaceNotices({
      issues: placeIssues,
      fullDiskAccessHolder: params.fullDiskAccessHolder,
    }),
    ...buildToolNotices({ issues: toolIssues }),
  ];
}

/**
 * Names Full Disk Access, with the link to its pane, only when macOS privacy protection blocked a
 * place: Full Disk Access does not lift a denial by a folder's own permissions.
 */
function buildPlaceNotices(params: {
  issues: ScanIssue[];
  fullDiskAccessHolder: FullDiskAccessHolder;
}): NoticeView[] {
  if (params.issues.length === 0) {
    return [];
  }

  const titleText = `Could not read ${formatCount({ count: params.issues.length, singular: 'place', plural: 'places' })}`;
  const issueLines = params.issues.map((issue) => formatIssueLine({ issue: issue }));
  const hasPrivacyDenied = params.issues.some((issue) => issue.reason === 'privacyDenied');

  if (!hasPrivacyDenied) {
    return [{ titleText: titleText, lines: issueLines, settingsLink: null }];
  }

  const fullDiskAccessLine = `Give ${fullDiskAccessHolderTexts[params.fullDiskAccessHolder]} Full Disk Access in System Settings > Privacy & Security to scan protected folders.`;

  return [
    {
      titleText: titleText,
      lines: [...issueLines, fullDiskAccessLine],
      settingsLink: FULL_DISK_ACCESS_SETTINGS_LINK,
    },
  ];
}

function buildToolNotices(params: { issues: ScanIssue[] }): NoticeView[] {
  if (params.issues.length === 0) {
    return [];
  }

  return [
    {
      titleText: `Could not ask ${formatCount({ count: params.issues.length, singular: 'tool', plural: 'tools' })}`,
      lines: params.issues.map((issue) => formatIssueLine({ issue: issue })),
      settingsLink: null,
    },
  ];
}

function formatIssueLine(params: { issue: ScanIssue }): string {
  const reasonText = issueReasonTexts[params.issue.reason];
  const detailText = formatIssueDetail({ issue: params.issue });

  return `${formatDisplayText({ text: params.issue.path })}: ${reasonText} (${detailText})`;
}

/** A failed tool reads as its summary, then the first line of its stderr when it wrote one. */
function formatIssueDetail(params: { issue: ScanIssue }): string {
  switch (params.issue.reason) {
    case 'privacyDenied':
    case 'permissionDenied':
    case 'unexpected':
    case 'commandFailed':
    case 'walkStopped':
      return formatDisplayText({ text: params.issue.detail });
    case 'toolUntrusted':
      return toolDistrustDetailTexts[params.issue.detail];
    case 'toolFailed': {
      const summary = formatToolFailureSummary({ failure: params.issue.failure });
      const firstStderrLine = formatToolFailureFirstStderrLine({ failure: params.issue.failure });

      if (firstStderrLine === null) {
        return summary;
      }

      return `${summary}: ${firstStderrLine}`;
    }
  }
}
