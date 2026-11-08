import { describe, expect, test } from 'bun:test';
import { CLAUDE_ENTRIES } from '../../../src/platform/darwin/catalog/claude.js';
import { buildRiskAndPathById } from './catalogPins.js';

describe('CLAUDE_ENTRIES', () => {
  test('pins the risk and the path of every entry', () => {
    expect(buildRiskAndPathById(CLAUDE_ENTRIES)).toEqual({
      'claude-code-transcripts': ['careful', '.claude/projects'],
      'claude-code-versions': ['safe', '.local/share/claude/versions'],
    });
  });
});
