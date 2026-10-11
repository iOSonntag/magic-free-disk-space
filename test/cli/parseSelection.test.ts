import { describe, expect, test } from 'bun:test';
import type { SelectionChoice } from '../../src/cli/parseSelection.js';
import { parseSelection } from '../../src/cli/parseSelection.js';

const choices: SelectionChoice[] = [
  { number: 1, risk: 'safe' },
  { number: 2, risk: 'careful' },
  { number: 4, risk: 'safe' },
  { number: 5, risk: 'review' },
  { number: 9, risk: 'never' },
];

describe('parseSelection', () => {
  describe('numbers and ranges', () => {
    test('empty input selects nothing', () => {
      expect(parseSelection({ input: '', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [],
      });
    });

    test('commas and whitespace separate tokens, and repeated separators are harmless', () => {
      expect(parseSelection({ input: ' , 1,,2 \t 4\n', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [1, 2, 4],
      });
    });

    test('numbers come back ascending and unique, whatever the input order', () => {
      expect(parseSelection({ input: '9 1 4 1', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [1, 4, 9],
      });
    });

    test('a range selects every number in it, and a comma ends it', () => {
      expect(parseSelection({ input: '4-5,9', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [4, 5, 9],
      });
    });

    test('a range that covers a number which is not a choice is out of range', () => {
      expect(parseSelection({ input: '1-4', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '1-4' },
      });
    });

    test('a number that is not a choice is out of range', () => {
      expect(parseSelection({ input: '3', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '3' },
      });
    });

    test('a reversed range is reported', () => {
      expect(parseSelection({ input: '5-2', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'reversedRange', token: '5-2' },
      });
    });
  });

  describe('keywords', () => {
    test('safe selects every choice whose risk is safe', () => {
      expect(parseSelection({ input: 'safe', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [1, 4],
      });
    });

    test('safe adds to the other tokens', () => {
      expect(parseSelection({ input: 'safe 2', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [1, 2, 4],
      });
    });

    test('keywords ignore case', () => {
      expect(parseSelection({ input: 'SAFE', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [1, 4],
      });
      expect(parseSelection({ input: 'None', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [],
      });
    });

    test('none alone selects nothing', () => {
      expect(parseSelection({ input: 'none', choices: choices })).toEqual({
        kind: 'succeeded',
        value: [],
      });
    });

    test('none with another token is reported as mixed', () => {
      expect(parseSelection({ input: 'none 1', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'noneMixed', token: 'none' },
      });
      expect(parseSelection({ input: '1 none', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'noneMixed', token: 'none' },
      });
      expect(parseSelection({ input: 'none none', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'noneMixed', token: 'none' },
      });
    });
  });

  describe('invalid tokens', () => {
    test('a word that is no keyword is an unknown token', () => {
      expect(parseSelection({ input: 'foo', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
    });

    test('a range without a second number, or with a dash in front, is an unknown token', () => {
      expect(parseSelection({ input: '1-', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '1-' },
      });
      expect(parseSelection({ input: '-1', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '-1' },
      });
    });

    test('a range with two dashes and a keyword with a dash are unknown tokens', () => {
      expect(parseSelection({ input: '1-2-4', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: '1-2-4' },
      });
      expect(parseSelection({ input: 'safe-1', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'safe-1' },
      });
    });

    test('the first failing token in input order is reported', () => {
      expect(parseSelection({ input: '99 foo', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'outOfRange', token: '99' },
      });
      expect(parseSelection({ input: '1 foo 99', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
      expect(parseSelection({ input: 'none foo', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'noneMixed', token: 'none' },
      });
      expect(parseSelection({ input: 'foo none', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownToken', token: 'foo' },
      });
      expect(parseSelection({ input: '5-2 99', choices: choices })).toEqual({
        kind: 'failed',
        failure: { reason: 'reversedRange', token: '5-2' },
      });
    });
  });
});
