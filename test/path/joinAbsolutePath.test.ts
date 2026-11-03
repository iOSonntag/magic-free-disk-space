import { describe, expect, test } from 'bun:test';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import { buildTestAbsolutePath } from '../support/parsedValueFixtures.js';

describe.skipIf(AWAITS_WIN32_PLATFORM)('joinAbsolutePath', () => {
  test('joins each name as one folder level below the parent', () => {
    expect(
      joinAbsolutePath({
        parentPath: buildTestAbsolutePath({ text: '/Users/example' }),
        names: ['Library', 'Android', 'sdk'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/Users/example/Library/Android/sdk' }));
    expect(
      joinAbsolutePath({
        parentPath: buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/' }),
        names: ['python@3.12'],
      }),
    ).toBe(buildTestAbsolutePath({ text: '/opt/homebrew/Cellar/python@3.12' }));
  });

  test('throws for a name that is no entry of its parent', () => {
    const parentPath = buildTestAbsolutePath({ text: '/opt/homebrew/Cellar' });

    for (const name of ['', '.', '..', 'wget/1.21.4', '../wget']) {
      expect(() => joinAbsolutePath({ parentPath: parentPath, names: [name] })).toThrow();
    }
  });
});
