import type { AdviceOpener, Risk } from '../catalog/catalog.js';
import { isRemovableRisk } from '../delete/validateRemoval.js';
import type { ExploreEngineAnswerFailure } from '../explore/exploreProbe.js';
import { formatHomeRelativePath } from '../path/formatHomeRelativePath.js';
import type { SectionTotal } from '../scan/buildSectionTotals.js';
import { buildSectionTotals } from '../scan/buildSectionTotals.js';
import type { Advice, Candidate, CandidateRemoval, SkipReason } from '../scan/candidate.js';
import { isProbedCandidate } from '../scan/candidate.js';
import type { CandidateOrigin, ItemKey, LeftoverMatch } from '../scan/candidateOrigin.js';
import { buildItemKey } from '../scan/candidateOrigin.js';
import type { ScanIssue } from '../scan/issue.js';
import type {
  CandidateGroup,
  CandidatePlace,
  CandidatePlaceSection,
  ConsumerSection,
} from '../scan/placeCandidate.js';
import {
  CONSUMER_SECTION_ORDER,
  getCategorySection,
  placeCandidate,
} from '../scan/placeCandidate.js';
import type { ScanReport, SkippedItem } from '../scan/runScan.js';
import type { VolumeSpace } from '../system/volumeSpace.js';
import type { ToolDistrustDetail } from '../tools/decideToolTrust.js';
import { formatSizeText, formatTotalSizeText } from './formatBytes.js';
import { formatCandidateCommandText } from './formatCandidateCommandText.js';
import { formatCount } from './formatCount.js';
import { formatDisplayText } from './formatDisplayText.js';
import { formatToolFailureFirstStderrLine, formatToolFailureSummary } from './formatToolFailure.js';
import type { NoticeView } from './noticeView.js';
import { FULL_DISK_ACCESS_SETTINGS_LINK } from './noticeView.js';
import type { ReportTexts } from './reportTexts.js';

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
  /** What each section holds, Explore items and advice in the section of their category. */
  sectionTotals: SectionTotal[];
};

type SummaryView = {
  titleText: string;
  lines: string[];
  /** The bytes of every offered item, as the title counts them. */
  totalBytes: number;
  /** The bytes of the items of every `safe` group. */
  safeBytes: number;
  /** The volume of the home folder; `null` when its space could not be read. */
  disk: VolumeSpace | null;
};

export type SectionView = {
  key: ConsumerSection;
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

/** The source of an item as a client words it; catalog items in the Trash read as `trash`. */
type ItemOriginView =
  | 'catalog'
  | 'trash'
  | 'project'
  | 'app'
  | 'largeFile'
  | 'leftover'
  | 'explore';

/**
 * How an offered item goes: deleted as its paths, by its tool's command, over its engine's API,
 * or evicted from the Mac while iCloud keeps it.
 */
type ItemRemovalView = 'delete' | 'tool' | 'engine' | 'evict';

/** A selectable item; `number` is what the selection names, `key` what a client keeps it by. */
export type ItemView = {
  number: number;
  key: ItemKey;
  title: string;
  /** For the colour of the item; `riskText` is what shows. */
  risk: Risk;
  riskText: string;
  sizeText: string;
  detailLines: ItemDetailLine[];
  /** The section of the item's category, also for an Explore item. */
  sectionKey: ConsumerSection;
  group: CandidateGroup;
  origin: ItemOriginView;
  removal: ItemRemovalView;
  allocatedBytes: number;
  isComplete: boolean;
  /** The path with `~` for the home folder, safe to show. */
  displayPath: string;
  /**
   * The path as it is, for the client to reveal in Finder; never shown. `null` for an engine's
   * item, which lives inside the engine's disk image and has no path of its own.
   */
  revealPath: string | null;
  /** ISO 8601; `null` when the scan judged no use. */
  lastUsedAt: string | null;
  /** ISO 8601; `null` when unknown. */
  downloadedAt: string | null;
  appName: string | null;
  /** How a leftover was tied to its app; `null` for every other item. */
  matchedBy: LeftoverMatch | null;
};

/** An advice item: never selectable, so it has no number. */
export type AdviceItemView = {
  key: ItemKey;
  title: string;
  risk: Risk;
  riskText: string;
  sizeText: string;
  detailLines: ItemDetailLine[];
  sectionKey: ConsumerSection;
  origin: ItemOriginView;
  removal: 'advice';
  allocatedBytes: number;
  displayPath: string;
  revealPath: string;
  /** Where the person handles it, the app that owns its data or a pane of settings; else `null`. */
  opener: AdviceOpener | null;
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

function buildSectionTitleTexts(params: { texts: ReportTexts }): Record<ConsumerSection, string> {
  return {
    caches: 'Caches',
    developerTools: 'Developer tools',
    projects: 'Projects',
    containers: 'Containers and VMs',
    aiModels: 'Local AI models',
    downloads: 'Downloads and installers',
    icloud: 'iCloud Drive',
    apps: 'Apps',
    largeFiles: 'Large files',
    trash: params.texts.trashName,
    ownApp: 'Handled by its own app',
  };
}

const originViews: Record<CandidateOrigin['kind'], ItemOriginView> = {
  catalog: 'catalog',
  artifact: 'project',
  application: 'app',
  userFile: 'largeFile',
  leftover: 'leftover',
  explore: 'explore',
};

const removalViews: Record<CandidateRemoval['kind'], ItemRemovalView> = {
  deletePaths: 'delete',
  deleteUnitPaths: 'delete',
  runTool: 'tool',
  callEngine: 'engine',
  evictUnitFiles: 'evict',
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

function buildSkipReasonTexts(params: { texts: ReportTexts }): Record<SkipReason, string> {
  return {
    belowSizeThreshold: 'too small to matter',
    symbolicLink: 'symbolic link, never followed',
    systemOwned: `owned by ${params.texts.systemName}`,
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
    heldByProbe: 'left to its Explore item',
  };
}

function buildIssueReasonTexts(params: {
  texts: ReportTexts;
}): Record<ScanIssue['reason'], string> {
  return {
    privacyDenied: `blocked by ${params.texts.systemName} privacy protection`,
    permissionDenied: 'permission denied',
    unexpected: 'unexpected error',
    commandFailed: 'a system command failed',
    walkStopped: 'search stopped at its time limit',
    toolFailed: 'the tool failed',
    toolUntrusted: 'the tool is not trusted, never run',
    engineFailed: 'the container engine did not answer as asked',
  };
}

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
  engineFailed: 'tool',
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
  texts: ReportTexts;
  homeDir: string;
  /** The space of the home folder's volume, read right before the view. */
  disk: VolumeSpace | null;
}): ScanView {
  const placedItems = params.report.candidates.map((candidate, index): PlacedItem => {
    const place = placeCandidate(candidate);

    return {
      candidate: candidate,
      place: place,
      view: buildItemView({
        candidate: candidate,
        place: place,
        number: index + 1,
        homeDir: params.homeDir,
      }),
    };
  });

  return {
    summary: buildSummaryView({ placedItems: placedItems, disk: params.disk }),
    sections: buildSectionViews({ placedItems: placedItems, texts: params.texts }),
    explore: buildExploreView({
      placedItems: placedItems,
      advice: params.report.advice,
      homeDir: params.homeDir,
    }),
    safeNumbers: params.report.safeNumbers,
    skipped: buildSkippedView({ skipped: params.report.skipped, texts: params.texts }),
    notices: [
      ...buildIssueNotices({
        issues: params.report.issues,
        fullDiskAccessHolder: params.fullDiskAccessHolder,
        texts: params.texts,
      }),
      ...buildPrivateSizeFallbackNotices({ report: params.report, texts: params.texts }),
    ],
    sectionTotals: buildSectionTotals({
      candidates: params.report.candidates,
      advice: params.report.advice,
    }),
  };
}

/** The total of every candidate, then one line per part of the summary that holds an item. */
function buildSummaryView(params: {
  placedItems: PlacedItem[];
  disk: VolumeSpace | null;
}): SummaryView {
  const totalBytes = sumAllocatedBytes({
    items: params.placedItems.map((item) => item.candidate),
  });
  const safeBytes = sumAllocatedBytes({
    items: params.placedItems.flatMap((item) =>
      item.place.group === 'safe' ? [item.candidate] : [],
    ),
  });

  if (params.placedItems.length === 0) {
    return {
      titleText: 'Nothing to delete was found.',
      lines: [],
      totalBytes: totalBytes,
      safeBytes: safeBytes,
      disk: params.disk,
    };
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
    totalBytes: totalBytes,
    safeBytes: safeBytes,
    disk: params.disk,
  };
}

function sumAllocatedBytes(params: { items: { allocatedBytes: number }[] }): number {
  return params.items.reduce((sum, item) => sum + item.allocatedBytes, 0);
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
function buildSectionViews(params: {
  placedItems: PlacedItem[];
  texts: ReportTexts;
}): SectionView[] {
  const sectionTitleTexts = buildSectionTitleTexts({ texts: params.texts });

  return CONSUMER_SECTION_ORDER.flatMap((section) => {
    const sectionItems = params.placedItems.flatMap((item): SectionPlacedItem[] =>
      item.place.kind === 'section' && item.place.section === section
        ? [{ candidate: item.candidate, place: item.place, view: item.view }]
        : [],
    );

    if (sectionItems.length === 0) {
      return [];
    }

    return [
      buildSectionView({
        section: section,
        titleText: sectionTitleTexts[section],
        sectionItems: sectionItems,
      }),
    ];
  });
}

/** The `review` and the `careful` groups wait together under "Check before deleting". */
function buildSectionView(params: {
  section: ConsumerSection;
  titleText: string;
  sectionItems: SectionPlacedItem[];
}): SectionView {
  const safeItems = params.sectionItems.flatMap((item) =>
    item.place.group === 'safe' ? [item.view] : [],
  );
  const checkItems = params.sectionItems.flatMap((item) =>
    item.place.group === 'safe' ? [] : [item.view],
  );

  return {
    key: params.section,
    titleText: params.titleText,
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
  homeDir: string;
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
    adviceGroup: buildAdviceGroupView({ advice: params.advice, homeDir: params.homeDir }),
  };
}

function buildAdviceGroupView(params: {
  advice: Advice[];
  homeDir: string;
}): AdviceGroupView | null {
  if (params.advice.length === 0) {
    return null;
  }

  return {
    titleText: ADVICE_GROUP_TITLE_TEXT,
    items: params.advice.map((item) =>
      buildAdviceItemView({ advice: item, homeDir: params.homeDir }),
    ),
  };
}

function buildItemView(params: {
  candidate: Candidate;
  place: CandidatePlace;
  number: number;
  homeDir: string;
}): ItemView {
  return {
    number: params.number,
    key: buildItemKey({ item: params.candidate }),
    title: formatDisplayText({ text: params.candidate.title }),
    risk: params.candidate.risk,
    riskText: riskTexts[params.candidate.risk],
    sizeText: formatSizeText(params.candidate),
    detailLines: buildItemDetailLines({ candidate: params.candidate }),
    sectionKey: params.place.section,
    group: params.place.group,
    origin: formatItemOrigin({ item: params.candidate }),
    removal: removalViews[params.candidate.removal.kind],
    allocatedBytes: params.candidate.allocatedBytes,
    isComplete: params.candidate.isComplete,
    displayPath: formatDisplayPath({ path: params.candidate.path, homeDir: params.homeDir }),
    revealPath: params.candidate.removal.kind === 'callEngine' ? null : params.candidate.path,
    lastUsedAt: formatInstantText({ ms: params.candidate.lastUsedAtMs }),
    downloadedAt: formatInstantText({ ms: params.candidate.downloadedAtMs }),
    appName: formatAppName({ appName: params.candidate.appName }),
    matchedBy:
      params.candidate.origin.kind === 'leftover' ? params.candidate.origin.matchedBy : null,
  };
}

/** A catalog item in the Trash reads as the Trash, where the person knows it from. */
function formatItemOrigin(params: { item: Candidate | Advice }): ItemOriginView {
  if (params.item.origin.kind === 'catalog' && params.item.category === 'trash') {
    return 'trash';
  }

  return originViews[params.item.origin.kind];
}

function formatDisplayPath(params: { path: string; homeDir: string }): string {
  return formatDisplayText({
    text: formatHomeRelativePath({ path: params.path, homeDir: params.homeDir }),
  });
}

function formatInstantText(params: { ms: number | null }): string | null {
  if (params.ms === null) {
    return null;
  }

  return new Date(params.ms).toISOString();
}

function formatAppName(params: { appName: string | null }): string | null {
  if (params.appName === null) {
    return null;
  }

  return formatDisplayText({ text: params.appName });
}

/** The path, the explanation, the regeneration, each evidence line, and a tool item's command. */
function buildItemDetailLines(params: { candidate: Candidate }): ItemDetailLine[] {
  const evidenceLines = isProbedCandidate(params.candidate) ? params.candidate.evidenceLines : [];
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

function buildAdviceItemView(params: { advice: Advice; homeDir: string }): AdviceItemView {
  return {
    key: buildItemKey({ item: params.advice }),
    title: formatDisplayText({ text: params.advice.title }),
    risk: params.advice.risk,
    riskText: riskTexts[params.advice.risk],
    sizeText: formatSizeText(params.advice),
    detailLines: [
      buildDetailLine({ kind: 'path', text: params.advice.path }),
      buildDetailLine({ kind: 'explanation', text: params.advice.explanation }),
      buildDetailLine({ kind: 'advice', text: params.advice.advice }),
    ],
    sectionKey: getCategorySection({ category: params.advice.category }),
    origin: formatItemOrigin({ item: params.advice }),
    removal: 'advice',
    allocatedBytes: params.advice.allocatedBytes,
    displayPath: formatDisplayPath({ path: params.advice.path, homeDir: params.homeDir }),
    revealPath: params.advice.path,
    opener: params.advice.opener,
  };
}

function buildDetailLine(params: { kind: ItemDetailLineKind; text: string }): ItemDetailLine {
  return { kind: params.kind, text: formatDisplayText({ text: params.text }) };
}

function buildSkippedView(params: {
  skipped: SkippedItem[];
  texts: ReportTexts;
}): SkippedView | null {
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
    lines: formatSkipReasonLines({ skipped: params.skipped, texts: params.texts }),
  };
}

/** One line per reason that occurs, in the order of the reason table. */
function formatSkipReasonLines(params: { skipped: SkippedItem[]; texts: ReportTexts }): string[] {
  const lines: string[] = [];

  for (const [reason, text] of Object.entries(buildSkipReasonTexts({ texts: params.texts }))) {
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
  texts: ReportTexts;
}): NoticeView[] {
  const placeIssues = params.issues.filter((issue) => issueNoticeKinds[issue.reason] === 'place');
  const toolIssues = params.issues.filter((issue) => issueNoticeKinds[issue.reason] === 'tool');
  const reasonTexts = buildIssueReasonTexts({ texts: params.texts });

  return [
    ...buildPlaceNotices({
      issues: placeIssues,
      fullDiskAccessHolder: params.fullDiskAccessHolder,
      reasonTexts: reasonTexts,
    }),
    ...buildToolNotices({ issues: toolIssues, reasonTexts: reasonTexts }),
  ];
}

/**
 * Names Full Disk Access, with the link to its pane, only when macOS privacy protection blocked a
 * place: Full Disk Access does not lift a denial by a folder's own permissions.
 */
function buildPlaceNotices(params: {
  issues: ScanIssue[];
  fullDiskAccessHolder: FullDiskAccessHolder;
  reasonTexts: Record<ScanIssue['reason'], string>;
}): NoticeView[] {
  if (params.issues.length === 0) {
    return [];
  }

  const titleText = `Could not read ${formatCount({ count: params.issues.length, singular: 'place', plural: 'places' })}`;
  const issueLines = params.issues.map((issue) =>
    formatIssueLine({ issue: issue, reasonTexts: params.reasonTexts }),
  );
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

/**
 * One notice when a size counts every block of an entry whose private size could not be read: such
 * a size may hold space the entry shares with a copy, which deleting it does not free.
 */
function buildPrivateSizeFallbackNotices(params: {
  report: ScanReport;
  texts: ReportTexts;
}): NoticeView[] {
  const fallbackCount = sumPrivateSizeFallbackCounts({
    items: [...params.report.candidates, ...params.report.advice],
  });

  if (fallbackCount === 0) {
    return [];
  }

  const entryCountText = formatCount({
    count: fallbackCount,
    singular: 'entry',
    plural: 'entries',
  });

  return [
    {
      titleText: 'Some sizes may be larger than the space they free',
      lines: [
        `${params.texts.systemName} did not give the private size of ${entryCountText}, so their full size counts, which may include space they share with a copy.`,
      ],
      settingsLink: null,
    },
  ];
}

function sumPrivateSizeFallbackCounts(params: {
  items: { privateSizeFallbackCount: number }[];
}): number {
  return params.items.reduce((sum, item) => sum + item.privateSizeFallbackCount, 0);
}

function buildToolNotices(params: {
  issues: ScanIssue[];
  reasonTexts: Record<ScanIssue['reason'], string>;
}): NoticeView[] {
  if (params.issues.length === 0) {
    return [];
  }

  return [
    {
      titleText: `Could not ask ${formatCount({ count: params.issues.length, singular: 'tool', plural: 'tools' })}`,
      lines: params.issues.map((issue) =>
        formatIssueLine({ issue: issue, reasonTexts: params.reasonTexts }),
      ),
      settingsLink: null,
    },
  ];
}

function formatIssueLine(params: {
  issue: ScanIssue;
  reasonTexts: Record<ScanIssue['reason'], string>;
}): string {
  const reasonText = params.reasonTexts[params.issue.reason];
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
    case 'engineFailed':
      return formatEngineFailureDetail({ failure: params.issue.failure });
  }
}

/** The endpoint asked, then the status it answered or the code of a request that got no answer. */
function formatEngineFailureDetail(params: { failure: ExploreEngineAnswerFailure }): string {
  switch (params.failure.kind) {
    case 'requestFailed':
      if (params.failure.status !== null) {
        return `${params.failure.endpoint} answered ${params.failure.status}`;
      }

      return `${params.failure.endpoint} got no answer: ${formatDisplayText({ text: params.failure.code ?? 'unknown error' })}`;
    case 'badAnswer':
      return `${params.failure.endpoint} gave an answer that could not be read`;
  }
}
