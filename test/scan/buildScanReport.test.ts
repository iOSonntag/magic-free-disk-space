import { expect, test } from 'bun:test';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { Candidate, CandidateDecision } from '../../src/scan/candidate.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCandidate,
  buildTestToolCandidate,
  TEST_LISTING_FACTS_NONE,
} from '../support/candidateFixtures.js';

function buildOffers(candidates: Candidate[]): CandidateDecision[] {
  return candidates.map(
    (candidate): CandidateDecision => ({ kind: 'offer', candidate: candidate }),
  );
}

describeAwaitingWin32Platform('buildScanReport', () => {
  test('ranks offers and advice by size and keeps every skip and issue', () => {
    const small = buildTestCandidate({ path: '/home/small', allocatedBytes: 10 });
    const large = buildTestCandidate({ path: '/home/large', allocatedBytes: 1000 });
    const decisions: CandidateDecision[] = [
      { kind: 'offer', candidate: small },
      { kind: 'skip', path: '/home/held', reason: 'ownerRunning' },
      { kind: 'offer', candidate: large },
      {
        kind: 'advice',
        advice: {
          origin: { kind: 'catalog', entryId: 'test-entry' },
          path: '/opt/tool',
          title: 'Tool',
          category: 'packages',
          risk: 'careful',
          explanation: 'Packages of a tool.',
          advice: 'Run the tool cleanup.',
          opener: null,
          allocatedBytes: 500,
          isComplete: true,
          ...TEST_LISTING_FACTS_NONE,
        },
      },
    ];
    const issue = { path: '/home/locked', reason: 'permissionDenied' as const, detail: 'EACCES' };

    const report = buildScanReport({ decisions: decisions, issues: [issue] });

    expect(report.candidates).toEqual([large, small]);
    expect(report.advice.map((item) => item.path)).toEqual(['/opt/tool']);
    expect(report.skipped).toEqual([{ path: '/home/held', reason: 'ownerRunning' }]);
    expect(report.issues).toEqual([issue]);
  });

  test('ranks safe before check within a section, Explore last, and numbers only the safe groups', () => {
    const safeSmall = buildTestCandidate({ path: '/home/safe-small', allocatedBytes: 10 });
    const careful = buildTestCandidate({
      path: '/home/careful',
      risk: 'careful',
      allocatedBytes: 500,
    });
    const safeLarge = buildTestCandidate({ path: '/home/safe-large', allocatedBytes: 1000 });
    const toolSmall = buildTestToolCandidate({
      homeDir: '/home',
      version: '18.0.0',
      allocatedBytes: 100,
    });
    const toolLarge = buildTestToolCandidate({
      homeDir: '/home',
      version: '20.1.0',
      allocatedBytes: 5000,
    });

    const report = buildScanReport({
      decisions: buildOffers([toolSmall, safeSmall, toolLarge, careful, safeLarge]),
      issues: [],
    });

    expect(report.candidates).toEqual([safeLarge, safeSmall, careful, toolLarge, toolSmall]);
    expect(report.safeNumbers).toEqual([1, 2]);
  });

  test('numbers the items top to bottom across the sections, so the safe numbers follow them', () => {
    const trashSafe = buildTestCandidate({
      path: '/home/.Trash',
      category: 'trash',
      risk: 'safe',
      allocatedBytes: 9000,
    });
    const appNever = buildTestCandidate({
      path: '/Applications/Kept.app',
      category: 'applications',
      risk: 'never',
      allocatedBytes: 8000,
    });
    const appSafe = buildTestCandidate({
      path: '/home/Library/Containers/gone',
      category: 'appContainers',
      risk: 'safe',
      allocatedBytes: 10,
    });
    const projectReview = buildTestCandidate({
      path: '/home/project/node_modules',
      category: 'projects',
      risk: 'review',
      allocatedBytes: 7000,
    });
    const cacheSafe = buildTestCandidate({
      path: '/home/Library/Caches/Tool',
      category: 'caches',
      risk: 'safe',
      allocatedBytes: 20,
    });
    const toolSafe = buildTestToolCandidate({
      homeDir: '/home',
      version: '20.1.0',
      allocatedBytes: 99_000,
    });

    const report = buildScanReport({
      decisions: buildOffers([trashSafe, appNever, toolSafe, appSafe, projectReview, cacheSafe]),
      issues: [],
    });

    expect(report.candidates).toEqual([
      cacheSafe,
      projectReview,
      appSafe,
      appNever,
      trashSafe,
      toolSafe,
    ]);
    expect(report.safeNumbers).toEqual([1, 3, 5]);
  });
});
