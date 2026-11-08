import { describe, expect, test } from 'bun:test';
import { parseRegistryFolderPaths } from '../../src/explore/vscodeExtensions/loadVscodeExtensionState.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { buildTestAbsolutePath, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const windowsExtensionsPath = buildTestWindowsPath({
  text: 'C:\\Users\\test\\.vscode\\extensions',
});

const posixExtensionsPath = buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions' });

/** An `extensions.json` as VS Code writes it on Windows: its URIs name the drive in lower case. */
const windowsRegistryText = JSON.stringify([
  {
    identifier: { id: 'pub.listed' },
    version: '1.0.0',
    location: {
      $mid: 1,
      fsPath: 'c:\\Users\\test\\.vscode\\extensions\\pub.listed-1.0.0',
      _sep: 1,
      external: 'file:///c%3A/Users/test/.vscode/extensions/pub.listed-1.0.0',
      path: '/c:/Users/test/.vscode/extensions/pub.listed-1.0.0',
      scheme: 'file',
    },
    relativeLocation: 'pub.listed-1.0.0',
  },
  {
    identifier: { id: 'pub.elsewhere' },
    version: '2.0.0',
    location: {
      $mid: 1,
      path: '/d:/Portable/extensions/pub.elsewhere-2.0.0',
      scheme: 'file',
    },
  },
]);

describe('parseRegistryFolderPaths', () => {
  test('takes a relative location under the extensions folder by the Windows rules', () => {
    expect(
      parseRegistryFolderPaths({
        pathRules: WIN32_PATH_RULES,
        text: windowsRegistryText,
        extensionsPath: windowsExtensionsPath,
      }),
    ).toEqual([
      buildTestWindowsPath({ text: 'C:\\Users\\test\\.vscode\\extensions\\pub.listed-1.0.0' }),
      buildTestWindowsPath({ text: 'D:\\Portable\\extensions\\pub.elsewhere-2.0.0' }),
    ]);
  });

  test('leaves a Windows registry unjudged for a location URI without a drive', () => {
    const text = JSON.stringify([
      { location: { path: '/share/extensions/pub.ext-1.0.0', scheme: 'file' } },
    ]);

    expect(
      parseRegistryFolderPaths({
        pathRules: WIN32_PATH_RULES,
        text: text,
        extensionsPath: windowsExtensionsPath,
      }),
    ).toBeNull();
  });

  test('takes a macOS location URI as the path it holds', () => {
    const text = JSON.stringify([
      { location: { path: '/Users/test/.vscode/extensions/pub.ext-1.0.0', scheme: 'file' } },
      { relativeLocation: 'pub.other-2.0.0' },
    ]);

    expect(
      parseRegistryFolderPaths({
        pathRules: POSIX_PATH_RULES,
        text: text,
        extensionsPath: posixExtensionsPath,
      }),
    ).toEqual([
      buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions/pub.ext-1.0.0' }),
      buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions/pub.other-2.0.0' }),
    ]);
  });
});
