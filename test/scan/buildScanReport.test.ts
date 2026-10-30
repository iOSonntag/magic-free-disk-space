import { describe, expect, test } from 'bun:test';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';

describe('buildScanReport', () => {
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
          path: '/opt/tool',
          title: 'Tool',
          category: 'packages',
          risk: 'careful',
          explanation: 'Packages of a tool.',
          advice: 'Run the tool cleanup.',
          allocatedBytes: 500,
          isComplete: true,
        },
      },
    ];
    const issue = { path: '/home/locked', reason: 'permissionDenied' as const, detail: 'EPERM' };

    const report = buildScanReport({ decisions: decisions, issues: [issue] });

    expect(report.candidates).toEqual([large, small]);
    expect(report.advice.map((item) => item.path)).toEqual(['/opt/tool']);
    expect(report.skipped).toEqual([{ path: '/home/held', reason: 'ownerRunning' }]);
    expect(report.issues).toEqual([issue]);
  });

  test('ranks the Explore items after all others and numbers only safe items outside Explore', () => {
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
    const decisions: CandidateDecision[] = [
      toolSmall,
      safeSmall,
      toolLarge,
      careful,
      safeLarge,
    ].map((candidate): CandidateDecision => ({ kind: 'offer', candidate: candidate }));

    const report = buildScanReport({ decisions: decisions, issues: [] });

    expect(report.candidates).toEqual([safeLarge, careful, safeSmall, toolLarge, toolSmall]);
    expect(report.safeNumbers).toEqual([1, 3]);
  });
});
