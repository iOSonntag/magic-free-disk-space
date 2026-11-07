import { describe, expect, test } from 'bun:test';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import { skipOffersTouchingProtectedPath } from '../../src/scan/skipOffersTouchingProtectedPath.js';
import { buildTestCandidate } from '../support/candidateFixtures.js';
import { buildTestPathEnvironment } from '../support/fixtureRoot.js';

const HOME_DIR = '/Users/example';

const ENVIRONMENT = buildTestPathEnvironment({ homeDir: HOME_DIR, nowMs: Date.UTC(2026, 0, 1) });

/** For each path, whether the scan skips its offer as protected. */
function findSkippedPaths(params: { paths: string[] }): boolean[] {
  const decisions = skipOffersTouchingProtectedPath({
    environment: ENVIRONMENT,
    decisions: params.paths.map((path) => ({
      kind: 'offer',
      candidate: buildTestCandidate({ path: path }),
    })),
  });

  return decisions.map(
    (decision) => decision.kind === 'skip' && decision.reason === 'protectedPath',
  );
}

describe('skipOffersTouchingProtectedPath', () => {
  test('skips an offer inside Messages outside its exceptions', () => {
    expect(findSkippedPaths({ paths: [`${HOME_DIR}/Library/Messages/Attachments/ab`] })).toEqual([
      true,
    ]);
  });

  test('keeps the offers of the preview caches of Messages', () => {
    const paths = [
      `${HOME_DIR}/Library/Messages/Caches/Previews/Attachments`,
      `${HOME_DIR}/Library/Messages/Caches/Previews/StickerCache/ab`,
      `${HOME_DIR}/Library/Messages/StickerCache`,
    ];

    expect(findSkippedPaths({ paths: paths })).toEqual([false, false, false]);
  });

  test('skips an offer of the deletion log and one that holds it', () => {
    const paths = [`${HOME_DIR}/Library/Logs/magic-free-disk-space`, `${HOME_DIR}/Library/Logs`];

    expect(findSkippedPaths({ paths: paths })).toEqual([true, true]);
  });

  test('skips an offer of a protected folder whole, and keeps one of its children', () => {
    const paths = [`${HOME_DIR}/Library`, `${HOME_DIR}/Library/Caches/com.example.app`];

    expect(findSkippedPaths({ paths: paths })).toEqual([true, false]);
  });

  test('compares without case, as the plan does', () => {
    expect(findSkippedPaths({ paths: [`${HOME_DIR}/library/MESSAGES/chat.db`] })).toEqual([true]);
  });

  test('keeps the path of the skipped offer, and passes advice and skips unchanged', () => {
    const path = `${HOME_DIR}/Library/Mail/V10`;
    const skip: CandidateDecision = { kind: 'skip', path: path, reason: 'symbolicLink' };

    expect(
      skipOffersTouchingProtectedPath({
        environment: ENVIRONMENT,
        decisions: [{ kind: 'offer', candidate: buildTestCandidate({ path: path }) }, skip],
      }),
    ).toEqual([{ kind: 'skip', path: path, reason: 'protectedPath' }, skip]);
  });
});
