import { describe, expect, test } from 'bun:test';
import { darwinToolProcesses } from '../../../src/platform/darwin/toolProcesses.js';

describe('darwinToolProcesses.buildBaseEnvironment', () => {
  test('holds exactly the fixed entries, with the tool folder first in PATH', () => {
    expect(
      darwinToolProcesses.buildBaseEnvironment({
        toolFolderPath: '/usr/bin',
        homeDir: '/fixture/home',
        tempDir: '/fixture/tmp',
      }),
    ).toEqual({
      HOME: '/fixture/home',
      TMPDIR: '/fixture/tmp',
      LANG: 'en_US.UTF-8',
      PATH: '/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    });
  });
});
