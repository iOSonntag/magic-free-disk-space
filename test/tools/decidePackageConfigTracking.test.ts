import { describe, expect, test } from 'bun:test';
import {
  decidePackageConfigTracking,
  parseGitDirFilePath,
} from '../../src/tools/decidePackageConfigTracking.js';
import { buildGitIndexBytes } from '../support/flutterSdkFixtures.js';

describe('decidePackageConfigTracking', () => {
  test('finds the package config in an index of version 2 or 3', () => {
    const paths = ['README.md', 'x/.dart_tool/package_config.json'];

    expect(decidePackageConfigTracking(buildGitIndexBytes({ version: 2, paths: paths }))).toBe(
      'tracked',
    );
    expect(decidePackageConfigTracking(buildGitIndexBytes({ version: 3, paths: paths }))).toBe(
      'tracked',
    );
  });

  test('returns untracked for an index of version 2 without the package config', () => {
    const indexBytes = buildGitIndexBytes({
      version: 2,
      paths: ['README.md', 'x/pubspec.yaml', 'x/.dart_tool/package_graph.json'],
    });

    expect(decidePackageConfigTracking(indexBytes)).toBe('untracked');
  });

  test('returns unknown for version 4, a bad signature, and a short header', () => {
    const indexBytes = buildGitIndexBytes({ version: 2, paths: ['README.md'] });
    const badSignatureBytes = indexBytes.slice();
    badSignatureBytes[0] = 0x58;

    expect(decidePackageConfigTracking(buildGitIndexBytes({ version: 4, paths: [] }))).toBe(
      'unknown',
    );
    expect(decidePackageConfigTracking(badSignatureBytes)).toBe('unknown');
    expect(decidePackageConfigTracking(indexBytes.subarray(0, 11))).toBe('unknown');
  });

  test('folds case, compatibility forms, and ignorable code points of the name', () => {
    for (const name of ['PACKAGE_CONFIG.JSON', 'pacKage_config.json', 'package‌_config.json']) {
      const indexBytes = buildGitIndexBytes({ version: 2, paths: [`x/.dart_tool/${name}`] });

      expect(decidePackageConfigTracking(indexBytes)).toBe('tracked');
    }
  });
});

describe('parseGitDirFilePath', () => {
  test('resolves a relative git dir against the folder', () => {
    expect(parseGitDirFilePath({ text: 'gitdir: ../.git/modules/sub', folder: '/super/sub' })).toBe(
      '/super/.git/modules/sub',
    );
  });

  test('keeps an absolute git dir and drops the line break', () => {
    expect(parseGitDirFilePath({ text: 'gitdir: /repo/.git/worktrees/wt\n', folder: '/wt' })).toBe(
      '/repo/.git/worktrees/wt',
    );
  });

  test('returns null for any other text', () => {
    expect(parseGitDirFilePath({ text: 'not a git file', folder: '/wt' })).toBeNull();
    expect(parseGitDirFilePath({ text: 'gitdir: \n', folder: '/wt' })).toBeNull();
    expect(parseGitDirFilePath({ text: '', folder: '/wt' })).toBeNull();
  });
});
