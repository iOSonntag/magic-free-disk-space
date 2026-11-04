import { describe, expect, test } from 'bun:test';
import type {
  Candidate,
  CandidateDecision,
  CandidateRecycleBin,
  SkipReason,
} from '../../src/scan/candidate.js';
import { skipOffersTheRemovalRefuses } from '../../src/scan/skipOffersTheRemovalRefuses.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';
import { EXAMPLE_WIN32_ENVIRONMENT } from '../support/environmentFixtures.js';
import {
  buildTestEvictCandidate,
  buildTestEvictTarget,
} from '../support/evictCandidateFixtures.js';
import { buildTestPathEnvironment } from '../support/fixtureRoot.js';
import { buildExampleHome, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const HOME_DIR = '/Users/example';

const ENVIRONMENT = buildTestPathEnvironment({ homeDir: HOME_DIR, nowMs: Date.UTC(2026, 0, 1) });

const CLOUD_DOCS = `${HOME_DIR}/Library/Mobile Documents/com~apple~CloudDocs`;

/** For each candidate, the reason the scan skips its offer for, `null` when it stays offered. */
function listSkipReasons(params: { candidates: Candidate[] }): (SkipReason | null)[] {
  const decisions = skipOffersTheRemovalRefuses({
    environment: ENVIRONMENT,
    decisions: params.candidates.map((candidate) => ({ kind: 'offer', candidate: candidate })),
  });

  return decisions.map((decision) => (decision.kind === 'skip' ? decision.reason : null));
}

/** For each path, whether the scan skips its offer as protected. */
function listProtectedSkipFlags(params: { paths: string[] }): boolean[] {
  return listSkipReasons({
    candidates: params.paths.map((path) => buildTestCandidate({ path: path })),
  }).map((reason) => reason === 'protectedPath');
}

describe('skipOffersTheRemovalRefuses', () => {
  test('skips an offer inside Messages outside its exceptions', () => {
    expect(
      listProtectedSkipFlags({ paths: [`${HOME_DIR}/Library/Messages/Attachments/ab`] }),
    ).toEqual([true]);
  });

  test('keeps the offers of the preview caches of Messages', () => {
    const paths = [
      `${HOME_DIR}/Library/Messages/Caches/Previews/Attachments`,
      `${HOME_DIR}/Library/Messages/Caches/Previews/StickerCache/ab`,
      `${HOME_DIR}/Library/Messages/StickerCache`,
    ];

    expect(listProtectedSkipFlags({ paths: paths })).toEqual([false, false, false]);
  });

  test('skips an offer of the deletion log and one that holds it', () => {
    const paths = [`${HOME_DIR}/Library/Logs/magic-free-disk-space`, `${HOME_DIR}/Library/Logs`];

    expect(listProtectedSkipFlags({ paths: paths })).toEqual([true, true]);
  });

  test('skips an offer of a protected folder whole, and keeps one of its children', () => {
    const paths = [`${HOME_DIR}/Library`, `${HOME_DIR}/Library/Caches/com.example.app`];

    expect(listProtectedSkipFlags({ paths: paths })).toEqual([true, false]);
  });

  test('compares without case, as the plan does', () => {
    expect(listProtectedSkipFlags({ paths: [`${HOME_DIR}/library/MESSAGES/chat.db`] })).toEqual([
      true,
    ]);
  });

  test('skips a delete whose target lies in iCloud Drive by its real path, wherever its path lies', () => {
    expect(
      listSkipReasons({
        candidates: [
          buildTestCandidate({
            path: `${HOME_DIR}/Downloads/video.mov`,
            realPath: `${CLOUD_DOCS}/video.mov`,
            kind: 'file',
          }),
        ],
      }),
    ).toEqual(['protectedPath']);
  });

  test('skips a delete outside the allowed folders, of a symbolic link, and of a device', () => {
    expect(
      listSkipReasons({
        candidates: [
          buildTestCandidate({ path: '/etc/hosts', kind: 'file' }),
          buildTestCandidate({ path: `${HOME_DIR}/Library/Caches/link`, kind: 'symbolicLink' }),
          buildTestCandidate({ path: `${HOME_DIR}/Library/Caches/socket`, kind: 'other' }),
        ],
      }),
    ).toEqual(['outsideAllowedRoot', 'symbolicLink', 'unsupportedKind']);
  });

  test('keeps an evict inside iCloud Drive, and skips one outside it or of a folder', () => {
    const folderPath = `${CLOUD_DOCS}/Projects`;

    expect(
      listSkipReasons({
        candidates: [
          buildTestEvictCandidate({
            folderPath: folderPath,
            targets: [buildTestEvictTarget({ path: `${folderPath}/video.mov` })],
          }),
          buildTestEvictCandidate({
            folderPath: folderPath,
            targets: [
              buildTestEvictTarget({ path: `${folderPath}/video.mov` }),
              buildTestEvictTarget({ path: `${HOME_DIR}/Downloads/video.mov` }),
            ],
          }),
          buildTestEvictCandidate({
            folderPath: folderPath,
            targets: [buildTestEvictTarget({ path: `${folderPath}/deep`, kind: 'directory' })],
          }),
        ],
      }),
    ).toEqual([null, 'outsideAllowedRoot', 'unsupportedKind']);
  });

  test('keeps a tool item, whose tool removes what it owns', () => {
    expect(
      listSkipReasons({
        candidates: [
          buildTestToolCandidate({ home: buildExampleHome({ text: HOME_DIR }), version: '20.1.0' }),
        ],
      }),
    ).toEqual([null]);
  });

  test('keeps the path of the skipped offer, and passes advice and skips unchanged', () => {
    const path = `${HOME_DIR}/Library/Mail/V10`;
    const skip: CandidateDecision = { kind: 'skip', path: path, reason: 'belowSizeThreshold' };

    expect(
      skipOffersTheRemovalRefuses({
        environment: ENVIRONMENT,
        decisions: [{ kind: 'offer', candidate: buildTestCandidate({ path: path }) }, skip],
      }),
    ).toEqual([{ kind: 'skip', path: path, reason: 'protectedPath' }, skip]);
  });

  test('keeps the Recycle Bin of a drive the environment lists, and skips that of another', () => {
    const decisions = skipOffersTheRemovalRefuses({
      environment: EXAMPLE_WIN32_ENVIRONMENT,
      decisions: ['D:\\', 'E:\\'].map(
        (driveRootText): CandidateDecision => ({
          kind: 'offer',
          candidate: buildRecycleBinCandidate({ driveRootText: driveRootText }),
        }),
      ),
    });

    expect(decisions.map((decision) => decision.kind)).toEqual(['offer', 'skip']);
    expect(decisions[1]).toEqual({
      kind: 'skip',
      path: 'E:\\$Recycle.Bin',
      reason: 'outsideAllowedRoot',
    });
  });
});

/** The Recycle Bin of the drive at `driveRootText`, as the scan offers it. */
function buildRecycleBinCandidate(params: { driveRootText: string }): CandidateRecycleBin {
  return {
    ...buildTestCandidate({
      path: `${params.driveRootText}$Recycle.Bin`,
      title: 'Recycle Bin',
      category: 'trash',
      risk: 'careful',
    }),
    origin: { kind: 'recycleBin' },
    removal: {
      kind: 'emptyRecycleBin',
      driveRootPath: buildTestWindowsPath({ text: params.driveRootText }),
      scannedContent: { sizeBytes: 4096, itemCount: 2 },
    },
  };
}
