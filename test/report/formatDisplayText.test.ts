import { describe, expect, test } from 'bun:test';
import { formatDisplayText } from '../../src/report/formatDisplayText.js';

describe('formatDisplayText', () => {
  test('keeps ordinary text, spaces, and non-Latin letters', () => {
    expect(formatDisplayText({ text: '/Users/jürgen/Downloads/Ünïcode 写真 file.zip' })).toBe(
      '/Users/jürgen/Downloads/Ünïcode 写真 file.zip',
    );
  });

  test('writes out line breaks, tabs, and escape sequences', () => {
    expect(formatDisplayText({ text: 'a\nb\rc\td' })).toBe('a\\u{a}b\\u{d}c\\u{9}d');
    expect(formatDisplayText({ text: 'x\u001b[2K\u001b[1Ay' })).toBe('x\\u{1b}[2K\\u{1b}[1Ay');
  });

  test('writes out DEL, C1 controls, and bidirectional marks', () => {
    expect(formatDisplayText({ text: 'a\u007fb\u009bc' })).toBe('a\\u{7f}b\\u{9b}c');
    expect(formatDisplayText({ text: 'gpj.‮exe' })).toBe('gpj.\\u{202e}exe');
    expect(formatDisplayText({ text: '⁦x⁩‎' })).toBe('\\u{2066}x\\u{2069}\\u{200e}');
  });
});
