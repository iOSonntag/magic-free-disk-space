/** Made-up `simctl runtime list -j` output in the format it prints; no value comes from a real machine. */

import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import {
  buildTestAbsolutePath,
  buildTestSimulatorRuntimeId,
} from '../support/parsedValueFixtures.js';

/** The scan's cutoff of last use in these tests. */
export const RUNTIME_UNUSED_CUTOFF_MS = Date.parse('2026-01-01T00:00:00Z');

/** Deletable, unused since the cutoff, and only an unavailable device of the fixtures names it. */
export const OFFERED_RUNTIME_ID = buildTestSimulatorRuntimeId({
  text: 'A1111111-1111-4111-8111-111111111111',
});

export const OFFERED_RUNTIME_IDENTIFIER = 'com.apple.CoreSimulator.SimRuntime.iOS-17-0';

export const OFFERED_RUNTIME_LAST_USED_AT_MS = Date.parse('2025-01-02T03:04:05.123Z');

/** Old and deletable, but available devices of the device fixtures run on it. */
export const DEVICE_RUNTIME_ID = buildTestSimulatorRuntimeId({
  text: 'B2222222-2222-4222-8222-222222222222',
});

export const UNDELETABLE_RUNTIME_ID = buildTestSimulatorRuntimeId({
  text: 'C3333333-3333-4333-8333-333333333333',
});

export const UNDATED_RUNTIME_ID = buildTestSimulatorRuntimeId({
  text: 'D4444444-4444-4444-8444-444444444444',
});

export const RECENT_RUNTIME_ID = buildTestSimulatorRuntimeId({
  text: 'E5555555-5555-4555-8555-555555555555',
});

export function buildRuntimeImagePath(params: { runtimeId: string }): AbsolutePath {
  return buildTestAbsolutePath({
    text: `/System/Library/AssetsV2/com_apple_MobileAsset_iOSSimulatorRuntime/${params.runtimeId}.asset/AssetData/Restore/example.dmg`,
  });
}

/** One runtime as `simctl runtime list -j` prints it; `lastUsedAt` `null` leaves the field out. */
export function buildRuntimeEntry(params: {
  runtimeId: string;
  runtimeIdentifier: string;
  version: string;
  isDeletable: boolean;
  lastUsedAt: string | null;
}): Record<string, unknown> {
  const build = `22A${params.version.replace('.', '')}`;
  const entry: Record<string, unknown> = {
    build: build,
    deletable: params.isDeletable,
    identifier: params.runtimeId,
    kind: 'Patchable Cryptex Disk Image',
    mountPath: `/Library/Developer/CoreSimulator/Volumes/iOS_${build}`,
    parentMountPath: `/Library/Developer/CoreSimulator/Cryptex/Images/bundle/SimRuntimeBundle-${params.runtimeId}`,
    path: buildRuntimeImagePath({ runtimeId: params.runtimeId }),
    platformIdentifier: 'com.apple.platform.iphonesimulator',
    runtimeBundlePath: `/Library/Developer/CoreSimulator/Volumes/iOS_${build}/Library/Developer/CoreSimulator/Profiles/Runtimes/iOS ${params.version}.simruntime`,
    runtimeIdentifier: params.runtimeIdentifier,
    signatureState: 'Verified',
    sizeBytes: 8_000_000_000,
    state: 'Ready',
    supportedArchitectures: ['arm64'],
    version: params.version,
  };

  if (params.lastUsedAt !== null) {
    entry.lastUsedAt = params.lastUsedAt;
  }

  return entry;
}

/**
 * Five runtimes, one per rule: the offered one, one an available device runs on, one not
 * deletable, one without `lastUsedAt`, and one used after the cutoff.
 */
export function buildSimulatorRuntimeListJson(): string {
  const entries = [
    buildRuntimeEntry({
      runtimeId: OFFERED_RUNTIME_ID,
      runtimeIdentifier: OFFERED_RUNTIME_IDENTIFIER,
      version: '17.0',
      isDeletable: true,
      lastUsedAt: '2025-01-02T03:04:05.123Z',
    }),
    buildRuntimeEntry({
      runtimeId: DEVICE_RUNTIME_ID,
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-26-0',
      version: '26.0',
      isDeletable: true,
      lastUsedAt: '2025-02-03T04:05:06Z',
    }),
    buildRuntimeEntry({
      runtimeId: UNDELETABLE_RUNTIME_ID,
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-2',
      version: '18.2',
      isDeletable: false,
      lastUsedAt: '2025-03-04T05:06:07Z',
    }),
    buildRuntimeEntry({
      runtimeId: UNDATED_RUNTIME_ID,
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-4',
      version: '18.4',
      isDeletable: true,
      lastUsedAt: null,
    }),
    buildRuntimeEntry({
      runtimeId: RECENT_RUNTIME_ID,
      runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
      version: '18.5',
      isDeletable: true,
      lastUsedAt: '2026-04-05T06:07:08Z',
    }),
  ];

  return JSON.stringify(
    Object.fromEntries(entries.map((entry) => [entry.identifier, entry])),
    null,
    2,
  );
}
