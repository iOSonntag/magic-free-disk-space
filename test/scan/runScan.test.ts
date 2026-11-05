import { expect, test } from 'bun:test';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import type { Advice, CandidateDecision } from '../../src/scan/candidate.js';
import { buildScanReportOfPhases } from '../../src/scan/runScan.js';
import { buildTestVscodeExtensionCandidate } from '../explore/vscodeExtensionFixtures.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { TEST_LISTING_FACTS_NONE } from '../support/candidateFixtures.js';

const HOME_DIR = '/Users/example';

const vscodeAdvice: Advice = {
  origin: { kind: 'catalog', entryId: 'vscode-extensions' },
  path: `${HOME_DIR}/.vscode/extensions`,
  title: 'VS Code extensions',
  category: 'developer',
  risk: 'review',
  explanation: 'Extensions VS Code installed.',
  advice: 'Uninstall the extensions you no longer use in VS Code.',
  allocatedBytes: 65_536,
  isComplete: true,
  ...TEST_LISTING_FACTS_NONE,
};

const vscodeCandidate = buildTestVscodeExtensionCandidate({ homeDir: HOME_DIR });

const vscodeOffer: CandidateDecision = { kind: 'offer', candidate: vscodeCandidate };

describeAwaitingWin32Platform('buildScanReportOfPhases', () => {
  test('keeps the offers of an incomplete probe and shows the advice of its entry', () => {
    const report = buildScanReportOfPhases({
      pathRules: DARWIN_PATH_RULES,
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
      pathRules: DARWIN_PATH_RULES,
      phases: [{ decisions: [vscodeOffer, { kind: 'advice', advice: vscodeAdvice }], issues: [] }],
      incompleteExploreAdvice: { decisions: [], issues: [] },
    });

    expect(report.candidates).toEqual([]);
    expect(report.skipped).toEqual([
      { path: vscodeCandidate.path, reason: 'overlapsEarlierCandidate' },
    ]);
  });
});
