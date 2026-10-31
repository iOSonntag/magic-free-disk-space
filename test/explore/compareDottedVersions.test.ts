import { describe, expect, test } from 'bun:test';
import { compareDottedVersions } from '../../src/explore/compareDottedVersions.js';

describe('compareDottedVersions', () => {
  test('is below zero when the left version is older', () => {
    expect(compareDottedVersions('1.2.3', '1.3.0')).toBeLessThan(0);
  });

  test('is above zero when the left version is newer', () => {
    expect(compareDottedVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  test('is zero when both versions are equal', () => {
    expect(compareDottedVersions('1.2.3', '1.2.3')).toBe(0);
  });

  test('compares a group by its number, not its text', () => {
    expect(compareDottedVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareDottedVersions('1.9.0', '1.10.0')).toBeLessThan(0);
  });

  test('counts a missing group as 0', () => {
    expect(compareDottedVersions('1.2', '1.2.0')).toBe(0);
    expect(compareDottedVersions('1.2.0', '1.2')).toBe(0);
    expect(compareDottedVersions('1.2', '1.2.1')).toBeLessThan(0);
    expect(compareDottedVersions('1.2.1', '1.2')).toBeGreaterThan(0);
  });
});
