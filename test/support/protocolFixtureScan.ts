import type { RemovalRun } from '../../src/delete/deleteCandidates.js';
import type { RemovalPlan } from '../../src/delete/planRemoval.js';
import { buildScanReport } from '../../src/scan/buildScanReport.js';
import type { Advice, Candidate, CandidateDecision } from '../../src/scan/candidate.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { VolumeSpace } from '../../src/system/volumeSpace.js';
import {
  buildTestAdvice,
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestProbedCandidate,
  buildTestRemovalOutcome,
} from './candidateFixtures.js';
import { buildTestEvictCandidate, buildTestEvictTarget } from './evictCandidateFixtures.js';
import {
  buildTestAbsolutePath,
  buildTestMacBundleId,
  buildTestUdid,
} from './parsedValueFixtures.js';

/** The home folder of the scan the protocol fixture shows. */
export const PROTOCOL_FIXTURE_HOME_DIR = '/Users/me';

export const PROTOCOL_FIXTURE_DISK: VolumeSpace = {
  capacityBytes: 500_000_000_000,
  availableBytes: 52_000_000_000,
};

/** The free space after the run of the protocol fixture's `deleted` event. */
export const PROTOCOL_FIXTURE_AVAILABLE_BYTES_AFTER = 58_000_000_000;

export const PROTOCOL_FIXTURE_LOG_PATH = `${PROTOCOL_FIXTURE_HOME_DIR}/Library/Logs/magic-free-disk-space/deletions.jsonl`;

const HOME_DIR = PROTOCOL_FIXTURE_HOME_DIR;

const MB = 1_000_000;

const SIMULATOR_UDID = '0A1B2C3D-0000-4000-8000-000000000001';

const CLOUD_DOCS = `${HOME_DIR}/Library/Mobile Documents/com~apple~CloudDocs`;

const TOOL_CACHE = buildTestCandidate({
  path: `${HOME_DIR}/Library/Caches/ToolCache`,
  title: 'Tool cache',
  category: 'caches',
  risk: 'safe',
  explanation: 'Files the tool keeps to work faster.',
  regeneration: 'The tool downloads them again when it needs them.',
  allocatedBytes: 6 * MB,
  origin: { kind: 'catalog', entryId: 'tool-cache' },
});

const APP_CACHE = buildTestCandidate({
  path: `${HOME_DIR}/Library/Caches/com.example.other`,
  title: 'App cache',
  category: 'caches',
  risk: 'review',
  explanation: 'Files an app keeps to work faster.',
  regeneration: 'The app builds them again, which can take a while.',
  allocatedBytes: 4 * MB,
  isComplete: false,
  origin: { kind: 'catalog', entryId: 'app-cache' },
  appName: 'Example',
});

const OLD_VIDEO = buildTestCandidate({
  path: `${HOME_DIR}/Movies/holiday.mov`,
  title: 'Old video',
  category: 'userFiles',
  risk: 'careful',
  explanation: 'A large file unchanged for 180 days.',
  regeneration: 'It does not come back.',
  allocatedBytes: 3 * MB,
  origin: { kind: 'userFile' },
  lastUsedAtMs: Date.UTC(2025, 5, 1),
  downloadedAtMs: Date.UTC(2024, 11, 24),
});

const CLOUD_FOLDER = buildTestEvictCandidate({
  folderPath: `${CLOUD_DOCS}/Projects`,
  targets: [
    buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects/video.mov` }),
    buildTestEvictTarget({ path: `${CLOUD_DOCS}/Projects/notes.pdf` }),
  ],
  allocatedBytes: 5 * MB,
});

const DOCKER_BUILD_CACHE = buildTestEngineCandidate({ homeDir: HOME_DIR, allocatedBytes: 2 * MB });

function buildSimulatorCandidate(): Candidate {
  const path = `${HOME_DIR}/Library/Developer/CoreSimulator/Devices/${SIMULATOR_UDID}`;

  return buildTestProbedCandidate({
    path: path,
    title: 'Simulator iPhone 15',
    category: 'developer',
    risk: 'review',
    explanation: 'A simulated device whose runtime is gone.',
    regeneration: 'Xcode creates a new one when you add it again.',
    allocatedBytes: 3 * MB,
    probe: 'simulatorDevices',
    removal: {
      kind: 'runTool',
      unit: {
        kind: 'simulatorDevice',
        tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
        udid: buildTestUdid({ text: SIMULATOR_UDID }),
        dataPath: buildTestAbsolutePath({ text: path }),
      },
    },
    evidenceLines: ['Its runtime iOS 17.0 is no longer installed.'],
  });
}

function buildToolStoreAdvice(params: {
  path: string;
  title: string;
  privateSizeFallbackCount: number;
}): Advice {
  return buildTestAdvice({
    origin: { kind: 'catalog', entryId: 'tool-store' },
    path: params.path,
    title: params.title,
    category: 'packages',
    explanation: 'Packages the tool keeps for its projects.',
    advice: 'Run the tool prune command.',
    allocatedBytes: 6 * MB,
    privateSizeFallbackCount: params.privateSizeFallbackCount,
  });
}

/**
 * The scan the `scanned` event of the protocol fixture shows: an item of every origin and of every
 * removal, a leftover of each match, advice with and without an opener, and every notice.
 */
export function buildProtocolFixtureReport(): ScanReport {
  const candidates = [
    buildSimulatorCandidate(),
    OLD_VIDEO,
    buildTestCandidate({
      path: '/Applications/Xcode.app',
      title: 'Xcode',
      category: 'applications',
      risk: 'never',
      explanation: "Apple's developer app, which other developer tools need.",
      regeneration: 'Installing it again takes a long download.',
      allocatedBytes: 2 * MB,
      origin: {
        kind: 'application',
        bundleId: buildTestMacBundleId({ text: 'com.apple.dt.Xcode' }),
      },
      lastUsedAtMs: Date.UTC(2025, 2, 15),
      appName: 'Xcode',
    }),
    buildTestCandidate({
      path: `${HOME_DIR}/Library/Containers/com.example.removed`,
      title: 'Data of an app that is no longer installed (com.example.removed)',
      category: 'leftovers',
      risk: 'careful',
      explanation: 'The sandbox container of an app that is not installed.',
      regeneration: 'Not regenerated.',
      allocatedBytes: MB,
      origin: { kind: 'leftover', matchedBy: 'bundleId' },
      lastUsedAtMs: Date.UTC(2025, 0, 10),
    }),
    buildTestCandidate({
      path: `${HOME_DIR}/Library/Application Support/Example Removed`,
      title: 'Data of an app that is no longer installed (Example Removed)',
      category: 'leftovers',
      risk: 'careful',
      explanation: 'The support folder of an app that is not installed, named as the app was.',
      regeneration: 'Not regenerated.',
      allocatedBytes: 2 * MB,
      origin: { kind: 'leftover', matchedBy: 'name' },
      lastUsedAtMs: Date.UTC(2024, 8, 1),
    }),
    APP_CACHE,
    TOOL_CACHE,
    CLOUD_FOLDER,
    DOCKER_BUILD_CACHE,
  ];
  const advice = [
    buildToolStoreAdvice({
      path: `${HOME_DIR}/Library/ToolStore`,
      title: 'Tool store',
      privateSizeFallbackCount: 2,
    }),
    buildTestAdvice({
      origin: { kind: 'catalog', entryId: 'photos-library' },
      path: `${HOME_DIR}/Pictures/Photos Library.photoslibrary`,
      title: 'Photos library',
      category: 'userFiles',
      explanation: 'The photos and videos of Photos.',
      advice: 'Remove photos in Photos, or keep the originals in iCloud.',
      opener: { kind: 'app', app: 'photos' },
      allocatedBytes: 7 * MB,
    }),
  ];
  const decisions: CandidateDecision[] = [
    ...candidates.map((candidate): CandidateDecision => ({ kind: 'offer', candidate: candidate })),
    ...advice.map((item): CandidateDecision => ({ kind: 'advice', advice: item })),
  ];
  const report = buildScanReport({
    decisions: decisions,
    issues: [
      { path: `${HOME_DIR}/Library/Mail`, reason: 'privacyDenied', detail: 'EPERM' },
      { path: `${HOME_DIR}/Projects/locked`, reason: 'permissionDenied', detail: 'EACCES' },
      {
        path: '/opt/homebrew/bin/brew',
        reason: 'toolFailed',
        failure: {
          reason: 'commandFailed',
          failure: { reason: 'exitedWithError', exitCode: 1, stderrTail: '' },
        },
      },
    ],
  });
  const skipped: ScanReport['skipped'] = [
    ...Array.from({ length: 9 }, (_, i) => ({
      path: `${HOME_DIR}/small-${i}`,
      reason: 'belowSizeThreshold' as const,
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      path: `${HOME_DIR}/busy-${i}`,
      reason: 'ownerRunning' as const,
    })),
  ];

  return { ...report, skipped: skipped };
}

/** The plan the `planned` event of the protocol fixture shows: the two caches and the evict. */
export function buildProtocolFixturePlan(): RemovalPlan {
  return { approved: [TOOL_CACHE, APP_CACHE, CLOUD_FOLDER], refused: [] };
}

/**
 * The run the `deleted` event of the protocol fixture shows: one item of each outcome, an evict
 * changed in part since the scan, and an engine whose space returns later.
 */
export function buildProtocolFixtureRun(): RemovalRun {
  return {
    outcomes: [
      buildTestRemovalOutcome({ candidate: TOOL_CACHE, outcome: 'removed', freedBytes: 6 * MB }),
      buildTestRemovalOutcome({ candidate: APP_CACHE, outcome: 'ownerRunning', freedBytes: 0 }),
      buildTestRemovalOutcome({
        candidate: CLOUD_FOLDER,
        outcome: 'changedSinceScan',
        freedBytes: 3 * MB,
      }),
      buildTestRemovalOutcome({
        candidate: OLD_VIDEO,
        outcome: 'permissionDenied',
        freedBytes: 0,
        code: 'EACCES',
      }),
      buildTestRemovalOutcome({
        candidate: DOCKER_BUILD_CACHE,
        outcome: 'removed',
        freedBytes: 2 * MB,
      }),
    ],
    journalFailure: null,
  };
}
