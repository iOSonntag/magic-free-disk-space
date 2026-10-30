import { describe, expect, test } from 'bun:test';
import { isDartVersionSupported } from '../../src/tools/isDartVersionSupported.js';

describe('isDartVersionSupported', () => {
  test('accepts Dart 3.11 and later, a prerelease and a trailing line break included', () => {
    expect(isDartVersionSupported('3.11.0')).toBe(true);
    expect(isDartVersionSupported('3.11.0\n')).toBe(true);
    expect(isDartVersionSupported('3.12.0-123.0.dev')).toBe(true);
    expect(isDartVersionSupported('4.0.0')).toBe(true);
  });

  test('rejects a Dart older than 3.11', () => {
    expect(isDartVersionSupported('3.10.4')).toBe(false);
    expect(isDartVersionSupported('2.19.6')).toBe(false);
  });

  test('rejects text that is no version', () => {
    expect(isDartVersionSupported('')).toBe(false);
    expect(isDartVersionSupported('garbage')).toBe(false);
    expect(isDartVersionSupported('3.11')).toBe(false);
    expect(isDartVersionSupported('v3.11.0')).toBe(false);
    expect(isDartVersionSupported('3.11.0 beta')).toBe(false);
  });
});
