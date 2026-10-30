import type { CatalogEntry } from '../catalog/catalog.js';
import { isDeleteConfirmation } from '../delete/confirmation.js';
import { deleteApprovedCandidates } from '../delete/deleteApprovedCandidates.js';
import type { RemovalPlan } from '../delete/planRemoval.js';
import { planRemoval } from '../delete/planRemoval.js';
import type { Environment } from '../environment/buildEnvironment.js';
import type { EnvironmentFailure } from '../environment/loadEnvironment.js';
import {
  CANCELLED_TEXT,
  formatDeletionWarningLines,
} from '../report/formatDeletionConfirmation.js';
import {
  formatDeletionLogLine,
  formatJournalUnavailableText,
} from '../report/formatDeletionLog.js';
import { formatEnvironmentFailure } from '../report/formatEnvironmentFailure.js';
import { formatRemovalPlan } from '../report/formatRemovalPlan.js';
import { formatRemovalRun } from '../report/formatRemovalRun.js';
import type { CandidateView } from '../report/formatScanReport.js';
import {
  formatCandidateSummary,
  formatCandidateView,
  formatScanReportNotes,
} from '../report/formatScanReport.js';
import type { Result } from '../result.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import type { ScanReport } from '../scan/runScan.js';
import { runScan } from '../scan/runScan.js';
import type { ToolInstallLocations } from '../tools/toolInstallLocations.js';
import { parseBridgeRequest } from './parseBridgeRequest.js';

type BridgeEventProgress = { kind: 'progress'; message: string };

type BridgeEventScanned = {
  kind: 'scanned';
  summaryText: string;
  candidates: CandidateView[];
  /** The numbers "Select safe" picks; older app builds ignore it and pick by risk. */
  safeNumbers: number[];
  notesLines: string[];
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

type BridgeEventFailed = {
  kind: 'failed';
  message: string;
  /** True when the bridge holds no scan anymore, so the next request must be a scan. */
  isScanDropped: boolean;
};

/** The final event of a request; progress events may come before it. */
type BridgeAnswer =
  | BridgeEventScanned
  | BridgeEventPlanned
  | BridgeEventNothingApproved
  | BridgeEventDeleted
  | BridgeEventCancelled
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
  catalogEntries: CatalogEntry[];
  toolInstallLocations: ToolInstallLocations;
  loadEnvironment: () => Promise<Result<Environment, EnvironmentFailure>>;
  clock: () => number;
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
  const startEnvironment = await params.loadEnvironment();

  if (startEnvironment.kind === 'failed') {
    params.io.writeEvent(
      buildFailedStep({
        message: formatEnvironmentFailure({ failure: startEnvironment.failure }),
        nextState: AWAITING_SCAN,
      }).answer,
    );

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
  }
}

/** Loads the environment afresh, so the age cutoffs count from this scan. */
async function answerScan(params: { context: BridgeContext }): Promise<BridgeStep> {
  const environment = await params.context.loadEnvironment();

  if (environment.kind === 'failed') {
    return buildFailedStep({
      message: formatEnvironmentFailure({ failure: environment.failure }),
      nextState: AWAITING_SCAN,
    });
  }

  const report = await runScan({
    environment: environment.value,
    catalogEntries: params.context.catalogEntries,
    toolInstallLocations: params.context.toolInstallLocations,
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
      summaryText: formatCandidateSummary({ candidates: report.candidates }),
      candidates: report.candidates.map((candidate, index) =>
        formatCandidateView({ candidate: candidate, number: index + 1 }),
      ),
      safeNumbers: report.safeNumbers,
      notesLines: formatScanReportNotes({ report: report, fullDiskAccessHolder: 'app' }),
    },
    nextState: { kind: 'scanned', report: report, environment: environment.value },
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
      warningLines: formatDeletionWarningLines(),
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
      isScanDropped: params.nextState.kind === 'awaitingScan',
    },
    nextState: params.nextState,
  };
}
