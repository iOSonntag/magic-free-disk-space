import { describe, expect, test } from 'bun:test';
import { IDE_ENTRIES } from '../../../src/platform/darwin/catalog/ides.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('IDE_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(IDE_ENTRIES)).toEqual({
      'jetbrains-ide-versions': ['review', 'Library/Application Support/JetBrains'],
      'vscode-code-cache': ['safe', 'Library/Application Support/Code/Code Cache'],
      'vscode-gpu-cache': ['safe', 'Library/Application Support/Code/GPUCache'],
      'vscode-logs': ['safe', 'Library/Application Support/Code/logs'],
      'vscode-cache': ['safe', 'Library/Application Support/Code/Cache'],
      'vscode-cached-data': ['safe', 'Library/Application Support/Code/CachedData'],
      'vscode-extension-downloads': [
        'safe',
        'Library/Application Support/Code/CachedExtensionVSIXs',
      ],
      'vscode-extensions': ['review', '.vscode/extensions'],
    });
  });
});
