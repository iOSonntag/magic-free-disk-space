import { describe, expect, test } from 'bun:test';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { reduceScanReport } from '../../src/scan/reduceScanReport.js';
import { buildTestAdvice, buildTestCandidate } from '../support/candidateFixtures.js';

function buildReport(candidates: Candidate[]) {
  return buildScanReport({
    decisions: [
      ...candidates.map((candidate) => ({ kind: 'offer' as const, candidate: candidate })),
      {
        kind: 'advice',
        advice: buildTestAdvice({ path: '/home/tool', allocatedBytes: 700 }),
      },
      { kind: 'skip', path: '/home/held', reason: 'ownerRunning' },
    ],
    appAdvice: null,
    cloudOnlyEntries: null,
    issues: [{ path: '/home/locked', reason: 'permissionDenied', detail: 'EACCES' }],
  });
}

describe('reduceScanReport', () => {
  const safeLarge = buildTestCandidate({ path: '/home/a', risk: 'safe', allocatedBytes: 900 });
  const safeSmall = buildTestCandidate({ path: '/home/b', risk: 'safe', allocatedBytes: 500 });
  const review = buildTestCandidate({ path: '/home/c', risk: 'review', allocatedBytes: 800 });
  const careful = buildTestCandidate({ path: '/home/d', risk: 'careful', allocatedBytes: 300 });

  test('drops each gone candidate and numbers the rest again, safe numbers included', () => {
    const report = buildReport([safeLarge, safeSmall, review, careful]);

    expect(report.candidates).toEqual([safeLarge, safeSmall, review, careful]);
    expect(report.safeNumbers).toEqual([1, 2]);

    const reduced = reduceScanReport({
      report: report,
      results: [
        { candidate: safeLarge, isGone: true, freedBytes: 900 },
        { candidate: review, isGone: true, freedBytes: 0 },
      ],
    });

    expect(reduced.candidates).toEqual([safeSmall, careful]);
    expect(reduced.safeNumbers).toEqual([1]);
    expect(reduced.advice).toBe(report.advice);
    expect(reduced.skipped).toBe(report.skipped);
    expect(reduced.issues).toBe(report.issues);
  });

  test('shrinks a candidate the run freed in part, never below zero, and ranks it again', () => {
    const report = buildReport([safeLarge, safeSmall, review, careful]);

    const reduced = reduceScanReport({
      report: report,
      results: [
        { candidate: safeLarge, isGone: false, freedBytes: 600 },
        { candidate: careful, isGone: false, freedBytes: 5000 },
      ],
    });

    expect(
      reduced.candidates.map((candidate) => [candidate.path, candidate.allocatedBytes]),
    ).toEqual([
      ['/home/b', 500],
      ['/home/a', 300],
      ['/home/c', 800],
      ['/home/d', 0],
    ]);
    expect(reduced.safeNumbers).toEqual([1, 2]);
  });

  test('keeps a candidate the run left whole as it is, and the report it was given', () => {
    const report = buildReport([safeLarge, review]);
    const candidatesBefore = [...report.candidates];

    const reduced = reduceScanReport({
      report: report,
      results: [{ candidate: review, isGone: false, freedBytes: 0 }],
    });

    expect(reduced.candidates).toEqual([safeLarge, review]);
    expect(reduced.candidates[1]).toBe(review);
    expect(report.candidates).toEqual(candidatesBefore);
  });
});
