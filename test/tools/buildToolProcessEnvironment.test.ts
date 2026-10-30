import { describe, expect, test } from 'bun:test';
import { buildToolProcessEnvironment } from '../../src/tools/buildToolProcessEnvironment.js';

describe('buildToolProcessEnvironment', () => {
  test('holds exactly the fixed entries, with the tool folder first in PATH', () => {
    const environment = buildToolProcessEnvironment({
      tool: { name: 'xcrun', path: '/usr/bin/xcrun' },
      homeDir: '/fixture/home',
      tempDir: '/fixture/tmp',
    });

    expect(environment).toEqual({
      HOME: '/fixture/home',
      TMPDIR: '/fixture/tmp',
      LANG: 'en_US.UTF-8',
      PATH: '/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    });
  });

  test('adds the offline switch for mise', () => {
    const environment = buildToolProcessEnvironment({
      tool: { name: 'mise', path: '/opt/homebrew/Cellar/mise/1.0.0/bin/mise' },
      homeDir: '/fixture/home',
      tempDir: '/fixture/tmp',
    });

    expect(environment).toEqual({
      HOME: '/fixture/home',
      TMPDIR: '/fixture/tmp',
      LANG: 'en_US.UTF-8',
      PATH: '/opt/homebrew/Cellar/mise/1.0.0/bin:/usr/bin:/bin:/usr/sbin:/sbin',
      MISE_OFFLINE: '1',
    });
  });

  test('adds nothing for dart', () => {
    const environment = buildToolProcessEnvironment({
      tool: { name: 'dart', path: '/sdk/flutter/bin/cache/dart-sdk/bin/dart' },
      homeDir: '/fixture/home',
      tempDir: '/fixture/tmp',
    });

    expect(Object.keys(environment).toSorted()).toEqual(['HOME', 'LANG', 'PATH', 'TMPDIR']);
  });
});
