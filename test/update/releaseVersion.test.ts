import { describe, expect, test } from 'bun:test';
import {
  compareReleaseVersions,
  formatReleaseTag,
  formatReleaseVersion,
  parseReleaseTag,
  parseReleaseVersion,
} from '../../src/update/releaseVersion.js';

describe('parseReleaseVersion', () => {
  test('parses X.Y.Z of non-negative integers', () => {
    expect(parseReleaseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseReleaseVersion('0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(parseReleaseVersion('10.20.300')).toEqual({ major: 10, minor: 20, patch: 300 });
  });

  test('refuses every other form', () => {
    const texts = [
      '',
      '1.2',
      '1.2.3.4',
      '01.2.3',
      '1.02.3',
      '1.2.03',
      'v1.2.3',
      '1.2.3-rc.1',
      '1.2.3+build',
      ' 1.2.3',
      '1.2.3\n',
      '-1.2.3',
      '1.2.x',
      '99999999999999999999.0.0',
    ];

    for (const text of texts) {
      expect(parseReleaseVersion(text)).toBeNull();
    }
  });
});

describe('parseReleaseTag', () => {
  test('parses vX.Y.Z and nothing else', () => {
    expect(parseReleaseTag('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });

    for (const tag of ['1.2.3', 'V1.2.3', 'v1.2', 'vv1.2.3', 'v1.2.3-beta', 'release-1.2.3', '']) {
      expect(parseReleaseTag(tag)).toBeNull();
    }
  });
});

describe('compareReleaseVersions', () => {
  test('orders by major, then minor, then patch, numerically', () => {
    const pairs = [
      ['1.2.3', '1.2.3', 0],
      ['1.10.0', '1.9.0', 1],
      ['1.2.9', '1.3.0', -1],
      ['2.0.0', '1.99.99', 1],
      ['0.0.1', '0.0.2', -1],
    ] as const;

    for (const [leftText, rightText, sign] of pairs) {
      const left = parseReleaseVersion(leftText);
      const right = parseReleaseVersion(rightText);

      if (left === null || right === null) {
        throw new Error('A version of the test does not parse');
      }

      expect(Math.sign(compareReleaseVersions(left, right))).toBe(sign);
    }
  });
});

describe('formatReleaseVersion', () => {
  test('writes X.Y.Z and the tag vX.Y.Z', () => {
    expect(formatReleaseVersion({ major: 1, minor: 20, patch: 0 })).toBe('1.20.0');
    expect(formatReleaseTag({ major: 1, minor: 20, patch: 0 })).toBe('v1.20.0');
  });
});
