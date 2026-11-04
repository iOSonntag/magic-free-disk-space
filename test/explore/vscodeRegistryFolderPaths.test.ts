import { describe, expect, test } from 'bun:test';
import { parseRegistryFolderPaths } from '../../src/explore/vscodeExtensions/loadVscodeExtensionState.js';
import { DARWIN_PATH_RULES } from '../../src/platform/darwin/loadEnvironment.js';
import { WIN32_PATH_RULES } from '../../src/platform/win32/loadEnvironment.js';
import { buildTestAbsolutePath, buildTestWindowsPath } from '../support/parsedValueFixtures.js';

const WINDOWS_EXTENSIONS_PATH = buildTestWindowsPath({
  text: 'C:\\Users\\test\\.vscode\\extensions',
});

const MAC_EXTENSIONS_PATH = buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions' });

/** An `extensions.json` as VS Code writes it on Windows: its URIs name the drive in lower case. */
const WINDOWS_REGISTRY_TEXT = JSON.stringify([
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
        text: WINDOWS_REGISTRY_TEXT,
        extensionsPath: WINDOWS_EXTENSIONS_PATH,
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
        extensionsPath: WINDOWS_EXTENSIONS_PATH,
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
        pathRules: DARWIN_PATH_RULES,
        text: text,
        extensionsPath: MAC_EXTENSIONS_PATH,
      }),
    ).toEqual([
      buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions/pub.ext-1.0.0' }),
      buildTestAbsolutePath({ text: '/Users/test/.vscode/extensions/pub.other-2.0.0' }),
    ]);
  });
});
