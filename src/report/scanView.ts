import type { Risk } from '../catalog/catalog.js';
import type { NoticeView } from './noticeView.js';

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

export type SummaryView = { titleText: string; lines: string[] };

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
export type AdviceGroupView = { titleText: string; items: AdviceItemView[] };

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
