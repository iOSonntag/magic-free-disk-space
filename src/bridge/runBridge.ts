import type { CatalogPlatform } from '../catalog/catalogPlatform.js';
import { isDeleteConfirmation } from '../delete/confirmation.js';
import { deleteApprovedCandidates } from '../delete/deleteApprovedCandidates.js';
import type { DeletePlatform } from '../delete/deletePlatform.js';
import type { RemovalPlan } from '../delete/planRemoval.js';
import { planRemoval } from '../delete/planRemoval.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { EnvironmentPlatform } from '../environment/environmentPlatform.js';
import type { ExplorePlatform } from '../explore/explorePlatform.js';
import { buildExploreProbePlatform } from '../explore/exploreProbe.js';
import type { Preferences, PreferencesSaveFailure } from '../preferences/preferencesFile.js';
import { buildFullDiskAccessNotices } from '../report/buildFullDiskAccessNotices.js';
import type { ScanView } from '../report/buildScanView.js';
import { buildScanView } from '../report/buildScanView.js';
import type { UpdateNoticeView } from '../report/buildUpdateNotice.js';
import { buildUpdateNotice } from '../report/buildUpdateNotice.js';
import {
  CANCELLED_TEXT,
  formatDeletionWarningLines,
} from '../report/formatDeletionConfirmation.js';
import {
  formatDeletionLogLine,
  formatJournalUnavailableText,
} from '../report/formatDeletionLog.js';
import { formatEnvironmentFailure } from '../report/formatEnvironmentFailure.js';
import { formatPreferencesSaveFailure } from '../report/formatPreferencesSaveFailure.js';
import { formatRemovalPlan } from '../report/formatRemovalPlan.js';
import { formatRemovalRun } from '../report/formatRemovalRun.js';
import type { NoticeView } from '../report/noticeView.js';
import type { ReportTexts } from '../report/reportTexts.js';
import type { Result } from '../result.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import type { ScanReport } from '../scan/runScan.js';
import { runScan } from '../scan/runScan.js';
import type { ScanPlatform } from '../scan/scanPlatform.js';
import type { FullDiskAccess } from '../system/fullDiskAccess.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';
import type { LatestReleaseFetchResult } from '../update/fetchLatestReleaseVersion.js';
import type { ReleaseVersion } from '../update/releaseVersion.js';
import { runUpdateCheck } from '../update/runUpdateCheck.js';
import { parseBridgeRequest } from './parseBridgeRequest.js';

type BridgeEventProgress = { kind: 'progress'; message: string };

type BridgeEventScanned = { kind: 'scanned' } & ScanView;

/** Whether the app has Full Disk Access, with the banner the app shows; `notices` is empty unless it is off. */
type BridgeEventStatus = {
  kind: 'status';
  fullDiskAccess: FullDiskAccess;
  notices: NoticeView[];
};

type BridgeEventPlanned = {
  kind: 'planned';
  planId: number;
  lines: string[];
  warningLines: string[];
};

type BridgeEventNothingApproved = { kind: 'nothingApproved'; lines: string[] };

type BridgeEventDeleted = { kind: 'deleted'; lines: string[] };

type BridgeEventCancelled = { kind: 'cancelled'; message: string };

/** The answer of every update check: `notice` only when a newer release exists. */
type BridgeEventUpdateChecked = {
  kind: 'updateChecked';
  isUpdateCheckEnabled: boolean;
  notice: UpdateNoticeView | null;
};

type BridgeEventUpdateCheckSet = { kind: 'updateCheckSet'; isUpdateCheckEnabled: boolean };

/**
 * What a failure did to the bridge: `scanDropped` leaves it without a scan, so the next request
 * must be a scan; `bridgeStopping` means it exits, so the next request needs a new bridge.
 */
type BridgeFailureEffect = 'scanKept' | 'scanDropped' | 'bridgeStopping';

type BridgeEventFailed = {
  kind: 'failed';
  message: string;
  effect: BridgeFailureEffect;
};

/** The final event of a request; progress events may come before it. */
type BridgeAnswer =
  | BridgeEventScanned
  | BridgeEventStatus
  | BridgeEventPlanned
  | BridgeEventNothingApproved
  | BridgeEventDeleted
  | BridgeEventCancelled
  | BridgeEventUpdateChecked
  | BridgeEventUpdateCheckSet
  | BridgeEventFailed;

export type BridgeEvent = BridgeEventProgress | BridgeAnswer;

/** The app's end of the bridge: one request per line in, one JSON event per line out. */
export type BridgeIo = {
  readLines(): AsyncIterable<string>;
  writeEvent(event: BridgeEvent): void;
};

export type BridgeEnd = 'inputEnded' | 'cannotStart';

type BridgeStateAwaitingScan = { kind: 'awaitingScan' };

type BridgeStateScanned = { kind: 'scanned'; report: ScanReport; environment: Environment };

type BridgeStatePlanned = {
  kind: 'planned';
  report: ScanReport;
  environment: Environment;
  plan: RemovalPlan;
  planId: number;
};

type BridgeState = BridgeStateAwaitingScan | BridgeStateScanned | BridgeStatePlanned;

type BridgeStep = { answer: BridgeAnswer; nextState: BridgeState };

type BridgeContext = {
  io: BridgeIo;
  /** The slices of the platform the bridge runs on. */
  environment: EnvironmentPlatform;
  catalog: CatalogPlatform;
  tools: ToolsPlatform;
  scan: ScanPlatform;
  system: SystemPlatform;
  delete: DeletePlatform;
  explore: ExplorePlatform;
  texts: ReportTexts;
  clock: () => number;
  /** `null` for a development build, which never looks for an update. */
  releaseVersion: ReleaseVersion | null;
  /** Never throws. */
  fetchLatestReleaseVersion: () => Promise<LatestReleaseFetchResult>;
  /** Never throws. */
  loadPreferences: (params: { preferencesDir: string }) => Promise<Preferences>;
  /** Never throws. */
  saveIsUpdateCheckEnabled: (params: {
    preferencesDir: string;
    isEnabled: boolean;
  }) => Promise<Result<null, PreferencesSaveFailure>>;
};

/**
 * A held scan older than this is refused: the app may stay open for days, while the items it
 * offers count as unused only at the time of the scan.
 */
const HELD_SCAN_MAX_AGE_MS = 3_600_000;

const AWAITING_SCAN: BridgeStateAwaitingScan = { kind: 'awaitingScan' };

/**
 * Answers the app's requests one at a time until its input ends. Refuses to start, after one
 * failed event, when the environment is unsafe. Deletes only the plan the app confirms with the
 * confirmation word, and only within an hour of its scan.
 */
export async function runBridge(params: BridgeContext): Promise<BridgeEnd> {
  const startEnvironment = await params.environment.loadEnvironment();

  if (startEnvironment.kind === 'failed') {
    params.io.writeEvent({
      kind: 'failed',
      message: formatEnvironmentFailure({ failure: startEnvironment.failure }),
      effect: 'bridgeStopping',
    });

    return 'cannotStart';
  }

  let state: BridgeState = AWAITING_SCAN;
  let lastPlanId = 0;

  for await (const line of params.io.readLines()) {
    // A blank line is no request; Bun's stdin reader also yields one when the input ends.
    if (line.trim() === '') {
      continue;
    }

    const step = await answerRequestLine({
      context: params,
      homeDir: startEnvironment.value.homeDir,
      preferencesDir: startEnvironment.value.preferencesDir,
      line: line,
      state: state,
      nextPlanId: lastPlanId + 1,
    });

    params.io.writeEvent(step.answer);
    state = step.nextState;

    if (state.kind === 'planned') {
      lastPlanId = state.planId;
    }
  }

  return 'inputEnded';
}

async function answerRequestLine(params: {
  context: BridgeContext;
  /** The home of the environment the bridge started in. */
  homeDir: string;
  /** The preferences folder of the environment the bridge started in. */
  preferencesDir: string;
  line: string;
  state: BridgeState;
  nextPlanId: number;
}): Promise<BridgeStep> {
  const parsed = parseBridgeRequest({ line: params.line });

  if (parsed.kind === 'failed') {
    return buildFailedStep({
      message: `The app sent a request the bridge does not know (${parsed.failure.reason}).`,
      nextState: params.state,
    });
  }

  switch (parsed.value.kind) {
    case 'scan':
      return answerScan({ context: params.context });
    case 'plan':
      return answerPlan({
        context: params.context,
        state: params.state,
        numbers: parsed.value.numbers,
        planId: params.nextPlanId,
      });
    case 'delete':
      return answerDelete({
        context: params.context,
        state: params.state,
        planId: parsed.value.planId,
        confirmation: parsed.value.confirmation,
      });
    case 'status':
      return answerStatus({
        context: params.context,
        homeDir: params.homeDir,
        state: params.state,
      });
    case 'checkUpdate':
      return answerCheckUpdate({
        context: params.context,
        preferencesDir: params.preferencesDir,
        state: params.state,
      });
    case 'setUpdateCheck':
      return answerSetUpdateCheck({
        context: params.context,
        preferencesDir: params.preferencesDir,
        state: params.state,
        isEnabled: parsed.value.isEnabled,
      });
  }
}

/** Keeps the held scan and plan; any failure of the check answers without a notice. */
async function answerCheckUpdate(params: {
  context: BridgeContext;
  preferencesDir: string;
  state: BridgeState;
}): Promise<BridgeStep> {
  const preferences = await params.context.loadPreferences({
    preferencesDir: params.preferencesDir,
  });
  const outcome = await runUpdateCheck({
    isUpdateCheckEnabled: preferences.isUpdateCheckEnabled,
    releaseVersion: params.context.releaseVersion,
    fetchLatestReleaseVersion: params.context.fetchLatestReleaseVersion,
  });

  return {
    answer: {
      kind: 'updateChecked',
      isUpdateCheckEnabled: preferences.isUpdateCheckEnabled,
      notice: buildUpdateNotice({ outcome: outcome, texts: params.context.texts }),
    },
    nextState: params.state,
  };
}

/** Keeps the held scan and plan; saves the switch and never fetches. */
async function answerSetUpdateCheck(params: {
  context: BridgeContext;
  preferencesDir: string;
  state: BridgeState;
  isEnabled: boolean;
}): Promise<BridgeStep> {
  const saved = await params.context.saveIsUpdateCheckEnabled({
    preferencesDir: params.preferencesDir,
    isEnabled: params.isEnabled,
  });

  if (saved.kind === 'failed') {
    return buildFailedStep({
      message: formatPreferencesSaveFailure({ failure: saved.failure }),
      nextState: params.state,
    });
  }

  return {
    answer: { kind: 'updateCheckSet', isUpdateCheckEnabled: params.isEnabled },
    nextState: params.state,
  };
}

/** Loads the environment afresh, so the age cutoffs count from this scan. */
async function answerScan(params: { context: BridgeContext }): Promise<BridgeStep> {
  const environment = await params.context.environment.loadEnvironment();

  if (environment.kind === 'failed') {
    return buildFailedStep({
      message: formatEnvironmentFailure({ failure: environment.failure }),
      nextState: AWAITING_SCAN,
    });
  }

  const report = await runScan({
    environment: environment.value,
    catalog: params.context.catalog,
    tools: params.context.tools,
    scan: params.context.scan,
    system: params.context.system,
    explore: params.context.explore,
    options: {
      staleDays: SCAN_LIMITS.defaultStaleDays,
      unusedDays: SCAN_LIMITS.defaultUnusedDays,
    },
    onProgress: (message) => {
      params.context.io.writeEvent({ kind: 'progress', message: message });
    },
  });

  return {
    answer: {
      kind: 'scanned',
      ...buildScanView({
        report: report,
        fullDiskAccessHolder: 'app',
        texts: params.context.texts,
      }),
    },
    nextState: { kind: 'scanned', report: report, environment: environment.value },
  };
}

/** Keeps the held scan and plan, so the app may ask at any time between its other requests. */
async function answerStatus(params: {
  context: BridgeContext;
  homeDir: string;
  state: BridgeState;
}): Promise<BridgeStep> {
  const fullDiskAccess = await params.context.system.loadFullDiskAccess({
    homeDir: params.homeDir,
  });

  return {
    answer: {
      kind: 'status',
      fullDiskAccess: fullDiskAccess,
      notices: buildFullDiskAccessNotices(fullDiskAccess),
    },
    nextState: params.state,
  };
}

function answerPlan(params: {
  context: BridgeContext;
  state: BridgeState;
  numbers: number[];
  planId: number;
}): BridgeStep {
  if (params.state.kind === 'awaitingScan') {
    return buildFailedStep({ message: 'Scan first.', nextState: params.state });
  }

  if (isHeldScanExpired({ environment: params.state.environment, nowMs: params.context.clock() })) {
    return buildExpiredStep();
  }

  const planned = planRemoval({
    ranked: params.state.report.candidates,
    selectedNumbers: params.numbers,
    environment: params.state.environment,
  });

  // Every plan request replaces the held plan, so a failed one leaves none to confirm.
  const scanned = toScannedState({ state: params.state });

  if (planned.kind === 'failed') {
    return buildFailedStep({
      message: `No item has the number ${planned.failure.number}.`,
      nextState: scanned,
    });
  }

  const lines = formatRemovalPlan({ plan: planned.value });

  if (planned.value.approved.length === 0) {
    return { answer: { kind: 'nothingApproved', lines: lines }, nextState: scanned };
  }

  return {
    answer: {
      kind: 'planned',
      planId: params.planId,
      lines: lines,
      warningLines: formatDeletionWarningLines({ texts: params.context.texts }),
    },
    nextState: {
      kind: 'planned',
      report: params.state.report,
      environment: params.state.environment,
      plan: planned.value,
      planId: params.planId,
    },
  };
}

async function answerDelete(params: {
  context: BridgeContext;
  state: BridgeState;
  planId: number;
  confirmation: string;
}): Promise<BridgeStep> {
  if (params.state.kind !== 'planned') {
    return buildFailedStep({
      message: 'No deletion waits for its confirmation; review it again.',
      nextState: params.state,
    });
  }

  if (isHeldScanExpired({ environment: params.state.environment, nowMs: params.context.clock() })) {
    return buildExpiredStep();
  }

  if (params.planId !== params.state.planId) {
    return buildFailedStep({
      message: 'This is not the deletion that waits for its confirmation; review it again.',
      nextState: params.state,
    });
  }

  const scanned = toScannedState({ state: params.state });

  if (!isDeleteConfirmation({ confirmation: params.confirmation })) {
    return { answer: { kind: 'cancelled', message: CANCELLED_TEXT }, nextState: scanned };
  }

  const removal = await deleteApprovedCandidates({
    plan: params.state.plan,
    environment: params.state.environment,
    delete: params.context.delete,
    loadRunningProcesses: params.context.system.loadRunningProcesses,
    entryReads: params.context.system.entryReads,
    probePlatform: buildExploreProbePlatform({
      explore: params.context.explore,
      tools: params.context.tools,
      system: params.context.system,
    }),
    clock: params.context.clock,
  });

  if (removal.kind === 'failed') {
    return buildFailedStep({
      message: formatJournalUnavailableText({ failure: removal.failure }),
      nextState: scanned,
    });
  }

  return {
    answer: {
      kind: 'deleted',
      lines: [
        ...formatRemovalRun({ run: removal.value.run }),
        formatDeletionLogLine({ logPath: removal.value.logPath }),
      ],
    },
    nextState: AWAITING_SCAN,
  };
}

/** The held scan without any plan. */
function toScannedState(params: {
  state: BridgeStateScanned | BridgeStatePlanned;
}): BridgeStateScanned {
  return {
    kind: 'scanned',
    report: params.state.report,
    environment: params.state.environment,
  };
}

function isHeldScanExpired(params: { environment: Environment; nowMs: number }): boolean {
  return params.nowMs - params.environment.nowMs > HELD_SCAN_MAX_AGE_MS;
}

function buildExpiredStep(): BridgeStep {
  return buildFailedStep({
    message: 'The scan is older than an hour; scan again.',
    nextState: AWAITING_SCAN,
  });
}

function buildFailedStep(params: { message: string; nextState: BridgeState }): BridgeStep {
  return {
    answer: {
      kind: 'failed',
      message: params.message,
      effect: params.nextState.kind === 'awaitingScan' ? 'scanDropped' : 'scanKept',
    },
    nextState: params.nextState,
  };
}
