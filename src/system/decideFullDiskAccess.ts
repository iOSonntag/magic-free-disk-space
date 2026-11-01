import type { ReadFailureVerdict } from './readFailure.js';

/** Whether macOS lets this process into the folders that privacy protection guards. */
export type FullDiskAccess = 'granted' | 'denied' | 'unknown';

/** What opening one probe path gave. */
export type FullDiskAccessProbeOutcome = 'opened' | 'privacyDenied' | 'missing' | 'failed';

type FullDiskAccessProbesTccDatabaseDecisive = { tccDatabase: 'opened' | 'privacyDenied' };

type FullDiskAccessProbesSafariProbed = {
  tccDatabase: 'missing' | 'failed';
  safari: FullDiskAccessProbeOutcome;
};

/** The outcomes of the probe: the Safari folder is probed only when the TCC database decided nothing. */
export type FullDiskAccessProbes =
  | FullDiskAccessProbesTccDatabaseDecisive
  | FullDiskAccessProbesSafariProbed;

/** A privacy denial means denied, an open means granted, and nothing decisive means unknown. */
export function decideFullDiskAccess(probes: FullDiskAccessProbes): FullDiskAccess {
  switch (probes.tccDatabase) {
    case 'opened':
    case 'privacyDenied':
      return probeOutcomeToFullDiskAccess(probes.tccDatabase);
    case 'missing':
    case 'failed':
      return probeOutcomeToFullDiskAccess(probes.safari);
  }
}

/**
 * The outcome of a probe open that failed with this verdict. Only a privacy denial is an answer of
 * macOS privacy protection; any other failure, such as a POSIX denial, decides nothing.
 */
export function readFailureVerdictToProbeOutcome(
  verdict: ReadFailureVerdict,
): Exclude<FullDiskAccessProbeOutcome, 'opened'> {
  switch (verdict.kind) {
    case 'absent':
      return 'missing';
    case 'unfit':
      return 'failed';
    case 'failed':
      return verdict.failure.reason === 'privacyDenied' ? 'privacyDenied' : 'failed';
  }
}

function probeOutcomeToFullDiskAccess(outcome: FullDiskAccessProbeOutcome): FullDiskAccess {
  switch (outcome) {
    case 'opened':
      return 'granted';
    case 'privacyDenied':
      return 'denied';
    case 'missing':
    case 'failed':
      return 'unknown';
  }
}
