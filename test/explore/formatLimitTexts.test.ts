import { describe, expect, test } from 'bun:test';
import { CLAUDE_TRANSCRIPT_UNTOUCHED_MS } from '../../src/explore/claudeTranscripts/decideOldTranscriptPaths.js';
import { BUILD_RECORD_UNUSED_MS } from '../../src/explore/engines/engineUnitRules.js';
import { formatCountWord, formatDaySpan } from '../../src/explore/formatLimitTexts.js';
import { HUGGING_FACE_PARTIAL_UNTOUCHED_MS } from '../../src/explore/huggingFace/decideHuggingFaceRepoOffers.js';
import { DAY_MS } from '../support/probeRunFixtures.js';

describe('formatDaySpan', () => {
  test('names a span by its days, one as a day', () => {
    expect(formatDaySpan(DAY_MS)).toBe('a day');
    expect(formatDaySpan(10 * DAY_MS)).toBe('10 days');
  });

  test('names the limits the probes write in their texts', () => {
    expect(formatDaySpan(HUGGING_FACE_PARTIAL_UNTOUCHED_MS)).toBe('a day');
    expect(formatDaySpan(BUILD_RECORD_UNUSED_MS)).toBe('10 days');
    expect(formatDaySpan(CLAUDE_TRANSCRIPT_UNTOUCHED_MS)).toBe('30 days');
  });
});

describe('formatCountWord', () => {
  test('writes a count below ten as a word, and a larger one in digits', () => {
    expect(formatCountWord(2)).toBe('two');
    expect(formatCountWord(9)).toBe('nine');
    expect(formatCountWord(1200)).toBe('1,200');
  });
});
