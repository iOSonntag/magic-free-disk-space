import { describe, expect, test } from 'bun:test';
import type { LatestReleaseFetchResult } from '../../src/update/fetchLatestReleaseVersion.js';
import type { ReleaseVersion } from '../../src/update/releaseVersion.js';
import { compareWithLatestRelease, runUpdateCheck } from '../../src/update/runUpdateCheck.js';

const RELEASE_1_2_0: ReleaseVersion = { major: 1, minor: 2, patch: 0 };

const RELEASE_1_3_0: ReleaseVersion = { major: 1, minor: 3, patch: 0 };

/** Runs the check over a fake fetch that answers `latest` and counts its calls. */
async function runCheck(params: {
  isUpdateCheckEnabled: boolean;
  releaseVersion: ReleaseVersion | null;
  latest: LatestReleaseFetchResult;
}): Promise<{ outcome: unknown; fetchCount: number }> {
  let fetchCount = 0;
  const outcome = await runUpdateCheck({
    preferences: { isUpdateCheckEnabled: params.isUpdateCheckEnabled },
    releaseVersion: params.releaseVersion,
    fetchLatestReleaseVersion: async () => {
      fetchCount += 1;

      return params.latest;
    },
  });

  return { outcome: outcome, fetchCount: fetchCount };
}

describe('runUpdateCheck', () => {
  test('is off without fetching when the preference is off', async () => {
    expect(
      await runCheck({
        isUpdateCheckEnabled: false,
        releaseVersion: RELEASE_1_2_0,
        latest: { kind: 'succeeded', value: RELEASE_1_3_0 },
      }),
    ).toEqual({ outcome: { kind: 'off' }, fetchCount: 0 });
  });

  test('is unversioned without fetching for a development build', async () => {
    expect(
      await runCheck({
        isUpdateCheckEnabled: true,
        releaseVersion: null,
        latest: { kind: 'succeeded', value: RELEASE_1_3_0 },
      }),
    ).toEqual({ outcome: { kind: 'unversioned' }, fetchCount: 0 });
  });

  test('carries the reason of a failed fetch', async () => {
    expect(
      await runCheck({
        isUpdateCheckEnabled: true,
        releaseVersion: RELEASE_1_2_0,
        latest: { kind: 'failed', failure: { reason: 'httpStatus' } },
      }),
    ).toEqual({ outcome: { kind: 'failed', reason: 'httpStatus' }, fetchCount: 1 });
  });

  test('is newer or current by the latest release', async () => {
    expect(
      await runCheck({
        isUpdateCheckEnabled: true,
        releaseVersion: RELEASE_1_2_0,
        latest: { kind: 'succeeded', value: RELEASE_1_3_0 },
      }),
    ).toEqual({
      outcome: { kind: 'newer', current: RELEASE_1_2_0, latest: RELEASE_1_3_0 },
      fetchCount: 1,
    });
    expect(
      await runCheck({
        isUpdateCheckEnabled: true,
        releaseVersion: RELEASE_1_2_0,
        latest: { kind: 'succeeded', value: RELEASE_1_2_0 },
      }),
    ).toEqual({ outcome: { kind: 'current' }, fetchCount: 1 });
  });
});

describe('compareWithLatestRelease', () => {
  test('counts an older latest release as current', () => {
    expect(compareWithLatestRelease({ current: RELEASE_1_3_0, latest: RELEASE_1_2_0 })).toEqual({
      kind: 'current',
    });
  });
});
