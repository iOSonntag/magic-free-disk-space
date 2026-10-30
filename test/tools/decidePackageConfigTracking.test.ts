import { describe, expect, test } from 'bun:test';
import type { Result } from '../../src/result.js';
import type { EntryStats } from '../../src/system/loadEntryStats.js';
import type { FileFailure } from '../../src/system/loadFileIdentity.js';
import {
  decidePackageConfigTracking,
  findPackageConfigCandidatePaths,
  PACKAGE_CONFIG_CANDIDATES_MAX_COUNT,
} from '../../src/tools/decidePackageConfigTracking.js';

/** The stats of a plain file `ino` on device 1. */
function buildFileStats(ino: bigint): Result<EntryStats, FileFailure> {
  return {
    kind: 'succeeded',
    value: { kind: 'file', dev: 1n, ino: ino, allocatedBytes: 4096, modifiedMs: 0 },
  };
}

function buildFailedStats(reason: FileFailure['reason']): Result<EntryStats, FileFailure> {
  return { kind: 'failed', failure: { reason: reason, code: 'ECODE' } };
}

describe('findPackageConfigCandidatePaths', () => {
  test('finds an entry whose last segment is the config name, in any folder', () => {
    const indexPaths = [
      'pubspec.yaml',
      'app/.dart_tool/package_config.json',
      'other/package_config.json',
      'package_config.json',
    ];

    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths })).toEqual([
      'app/.dart_tool/package_config.json',
      'other/package_config.json',
      'package_config.json',
    ]);
  });

  test('finds a last segment in upper case, or with the Kelvin sign or long s', () => {
    const kelvinSign = String.fromCodePoint(0x212a);
    const longS = String.fromCodePoint(0x17f);
    const indexPaths = [
      'a/PACKAGE_CONFIG.JSON',
      `b/pac${kelvinSign}age_config.json`,
      `c/package_config.j${longS}on`,
    ];

    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths })).toEqual(indexPaths);
  });

  test('finds a last segment with a zero-width joiner inserted', () => {
    const zeroWidthJoiner = String.fromCodePoint(0x200d);
    const indexPaths = [`app/package${zeroWidthJoiner}_config.json`];

    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths })).toEqual(indexPaths);
  });

  test('finds no backup of the config, and no folder of its name', () => {
    const indexPaths = ['app/package_config.json.backup', 'package_config.json/README.md'];

    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths })).toEqual([]);
  });

  test('returns null for more candidates than the bound', () => {
    const indexPaths = Array.from(
      { length: PACKAGE_CONFIG_CANDIDATES_MAX_COUNT + 1 },
      (_, index) => `p${index}/package_config.json`,
    );

    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths.slice(1) })).toHaveLength(
      PACKAGE_CONFIG_CANDIDATES_MAX_COUNT,
    );
    expect(findPackageConfigCandidatePaths({ indexPaths: indexPaths })).toBe(null);
  });
});

describe('decidePackageConfigTracking', () => {
  test('returns tracked for a candidate that is the same file as the config', () => {
    const tracking = decidePackageConfigTracking({
      packageConfigStats: buildFileStats(7n),
      candidateStats: [
        buildFileStats(8n),
        buildFailedStats('permissionDenied'),
        buildFileStats(7n),
      ],
    });

    expect(tracking).toBe('tracked');
  });

  test('returns untracked for candidates that are other files or missing', () => {
    const tracking = decidePackageConfigTracking({
      packageConfigStats: buildFileStats(7n),
      candidateStats: [buildFileStats(8n), buildFailedStats('missing')],
    });

    expect(tracking).toBe('untracked');
  });

  test('returns untracked for the same inode on another device', () => {
    const tracking = decidePackageConfigTracking({
      packageConfigStats: buildFileStats(7n),
      candidateStats: [
        {
          kind: 'succeeded',
          value: { kind: 'file', dev: 2n, ino: 7n, allocatedBytes: 0, modifiedMs: 0 },
        },
      ],
    });

    expect(tracking).toBe('untracked');
  });

  test('returns untracked for no candidate', () => {
    const tracking = decidePackageConfigTracking({
      packageConfigStats: buildFileStats(7n),
      candidateStats: [],
    });

    expect(tracking).toBe('untracked');
  });

  test('returns unknown for a candidate whose stats fail other than missing', () => {
    for (const reason of ['permissionDenied', 'unexpected'] as const) {
      const tracking = decidePackageConfigTracking({
        packageConfigStats: buildFileStats(7n),
        candidateStats: [buildFileStats(8n), buildFailedStats(reason)],
      });

      expect(tracking).toBe('unknown');
    }
  });

  test('returns unknown when the stats of the config fail', () => {
    const tracking = decidePackageConfigTracking({
      packageConfigStats: buildFailedStats('missing'),
      candidateStats: [buildFileStats(7n)],
    });

    expect(tracking).toBe('unknown');
  });
});
