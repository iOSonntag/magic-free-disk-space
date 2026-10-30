import { describe, expect, test } from 'bun:test';
import { parseGitDirFilePath } from '../../src/tools/parseGitDirFilePath.js';

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
