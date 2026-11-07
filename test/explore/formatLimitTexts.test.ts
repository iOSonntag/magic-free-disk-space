import { describe, expect, test } from 'bun:test';
import { CLAUDE_TRANSCRIPT_UNTOUCHED_MS } from '../../src/explore/claudeTranscripts/decideOldTranscriptPaths.js';
import { BUILD_RECORD_UNUSED_MS } from '../../src/explore/engines/engineUnitRules.js';
import {
  formatCountText,
  formatCountWord,
  formatDaySpan,
  formatIsoDay,
} from '../../src/explore/formatLimitTexts.js';
import { HUGGING_FACE_PARTIAL_UNTOUCHED_MS } from '../../src/explore/huggingFace/decideHuggingFaceRepoOffers.js';
import { DAY_MS } from '../../src/scan/limits.js';

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

describe('formatCountText', () => {
  test('writes the noun in the singular for one alone', () => {
    expect(formatCountText({ count: 1, noun: 'file' })).toBe('1 file');
    expect(formatCountText({ count: 0, noun: 'file' })).toBe('0 files');
    expect(formatCountText({ count: 3, noun: 'cache record' })).toBe('3 cache records');
  });
});

describe('formatIsoDay', () => {
  test('writes the day of a time in UTC', () => {
    expect(formatIsoDay(Date.UTC(2026, 10, 7, 23, 59))).toBe('2026-11-07');
    expect(formatIsoDay(Date.UTC(2026, 0, 1))).toBe('2026-01-01');
  });
});
