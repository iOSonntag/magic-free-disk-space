import { describe, expect, test } from 'bun:test';
import { parseSelection } from '../../src/cli/parseSelection.js';

const CHOICE_COUNT = 5;

const safeNumbers = [1, 4];

function parseTestSelection(input: string): ReturnType<typeof parseSelection> {
  return parseSelection({ input: input, choiceCount: CHOICE_COUNT, safeNumbers: safeNumbers });
}

describe('parseSelection', () => {
  describe('numbers and ranges', () => {
    test('empty input selects nothing', () => {
      expect(parseTestSelection('')).toEqual({ kind: 'succeeded', value: [] });
    });

    test('commas and whitespace separate tokens, and repeated separators are harmless', () => {
      expect(parseTestSelection(' , 1,,2 \t 4\n')).toEqual({ kind: 'succeeded', value: [1, 2, 4] });
    });

    test('numbers come back ascending and unique, whatever the input order', () => {
      expect(parseTestSelection('5 1 4 1')).toEqual({ kind: 'succeeded', value: [1, 4, 5] });
    });

    test('a range selects every number in it, and a comma ends it', () => {
      expect(parseTestSelection('2-3,5')).toEqual({ kind: 'succeeded', value: [2, 3, 5] });
    });

    test('a range that reaches past the last item is out of range', () => {
      expect(parseTestSelection('4-6')).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '4-6' },
      });
    });

    test('a number past the last item, or zero, is out of range', () => {
      expect(parseTestSelection('6')).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '6' },
      });
      expect(parseTestSelection('0')).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '0' },
      });
    });

    test('a reversed range is reported', () => {
      expect(parseTestSelection('5-2')).toEqual({
        kind: 'failed',
        failure: { reason: 'reversedRange', token: '5-2' },
      });
    });
  });

  describe('keywords', () => {
    test('safe selects the safe numbers the report decided', () => {
      expect(parseTestSelection('safe')).toEqual({ kind: 'succeeded', value: [1, 4] });
    });

    test('safe selects nothing when the report has no safe numbers', () => {
      expect(parseSelection({ input: 'safe', choiceCount: CHOICE_COUNT, safeNumbers: [] })).toEqual(
        { kind: 'succeeded', value: [] },
      );
    });

    test('safe adds to the other tokens', () => {
      expect(parseTestSelection('safe 2')).toEqual({ kind: 'succeeded', value: [1, 2, 4] });
    });

    test('keywords ignore case', () => {
      expect(parseTestSelection('SAFE')).toEqual({ kind: 'succeeded', value: [1, 4] });
      expect(parseTestSelection('None')).toEqual({ kind: 'succeeded', value: [] });
    });

    test('none alone selects nothing', () => {
      expect(parseTestSelection('none')).toEqual({ kind: 'succeeded', value: [] });
    });

    test('none with another token is reported as mixed', () => {
      for (const input of ['none 1', '1 none', 'none none']) {
        expect(parseTestSelection(input)).toEqual({
          kind: 'failed',
          failure: { reason: 'noneMixed', token: 'none' },
        });
      }
    });
  });

  describe('invalid tokens', () => {
    test('a word that is no keyword is an unknown token', () => {
      expect(parseTestSelection('foo')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
    });

    test('a range without a second number, or with a dash in front, is an unknown token', () => {
      expect(parseTestSelection('1-')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '1-' },
      });
      expect(parseTestSelection('-1')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '-1' },
      });
    });

    test('a range with two dashes and a keyword with a dash are unknown tokens', () => {
      expect(parseTestSelection('1-2-4')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '1-2-4' },
      });
      expect(parseTestSelection('safe-1')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'safe-1' },
      });
    });

    test('the first failing token in input order is reported', () => {
      expect(parseTestSelection('99 foo')).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '99' },
      });
      expect(parseTestSelection('1 foo 99')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
      expect(parseTestSelection('none foo')).toEqual({
        kind: 'failed',
        failure: { reason: 'noneMixed', token: 'none' },
      });
      expect(parseTestSelection('foo none')).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
      expect(parseTestSelection('5-2 99')).toEqual({
        kind: 'failed',
        failure: { reason: 'reversedRange', token: '5-2' },
      });
    });
  });
});
