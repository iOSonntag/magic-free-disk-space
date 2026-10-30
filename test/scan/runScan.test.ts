import { describe, expect, test } from 'bun:test';
import type { Advice, CandidateDecision } from '../../src/scan/candidate.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';

const HOME_DIR = '/Users/example';

const vscodeAdvice: Advice = {
  path: `${HOME_DIR}/.vscode/extensions`,
  title: 'VS Code extensions',
  category: 'developer',
  risk: 'review',
  explanation: 'Extensions VS Code installed.',
  advice: 'Uninstall the extensions you no longer use in VS Code.',
  allocatedBytes: 65_536,
  isComplete: true,
};

const vscodeCandidate = buildTestVscodeExtensionCandidate({ homeDir: HOME_DIR });

const vscodeOffer: CandidateDecision = { kind: 'offer', candidate: vscodeCandidate };

describe('buildScanReportOfPhases', () => {
  test('keeps the offers of an incomplete probe and shows the advice of its entry', () => {
    const report = buildScanReportOfPhases({
      phases: [{ decisions: [vscodeOffer], issues: [] }],
      incompleteExploreAdvice: {
        decisions: [{ kind: 'advice', advice: vscodeAdvice }],
        issues: [{ path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' }],
      },
    });

    expect(report.candidates).toEqual([vscodeCandidate]);
    expect(report.advice).toEqual([vscodeAdvice]);
    expect(report.skipped).toEqual([]);
    expect(report.issues).toEqual([
      { path: vscodeAdvice.path, reason: 'unexpected', detail: 'EIO' },
    ]);
  });

  test('would hold back those offers if the advice took part in the dedupe', () => {
    const report = buildScanReportOfPhases({
      phases: [{ decisions: [vscodeOffer, { kind: 'advice', advice: vscodeAdvice }], issues: [] }],
      incompleteExploreAdvice: { decisions: [], issues: [] },
    });

    expect(report.candidates).toEqual([]);
    expect(report.skipped).toEqual([
      { path: vscodeCandidate.path, reason: 'overlapsEarlierCandidate' },
    ]);
  });
});
