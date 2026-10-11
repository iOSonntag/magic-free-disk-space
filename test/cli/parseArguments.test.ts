import { describe, expect, test } from 'bun:test';
import { parseArguments } from '../../src/cli/parseArguments.js';
import { SCAN_LIMITS } from '../../src/scan/limits.js';

describe('parseArguments', () => {
  describe('modes', () => {
    test('no arguments select the interactive mode with the default day counts', () => {
      expect(parseArguments({ argv: [] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'interactive' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });

    test('--list selects the list mode', () => {
      expect(parseArguments({ argv: ['--list'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'list' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });

    test('--dry-run without --select plans with no selection', () => {
      expect(parseArguments({ argv: ['--dry-run'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'dryRun', selectionSpec: null },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });

    test('--dry-run with --select keeps the selection text', () => {
      expect(parseArguments({ argv: ['--dry-run', '--select', '1-3,7'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'dryRun', selectionSpec: '1-3,7' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });

    test('--help and -h select the help mode', () => {
      expect(parseArguments({ argv: ['--help'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'help' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
      expect(parseArguments({ argv: ['-h'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'help' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });

    test('day counts alone keep the interactive mode', () => {
      expect(parseArguments({ argv: ['--stale-days', '5', '--unused-days', '30'] })).toEqual({
        kind: 'succeeded',
        value: { mode: { kind: 'interactive' }, staleDays: 5, unusedDays: 30 },
      });
    });

    test('day counts apply in the list mode too', () => {
      expect(parseArguments({ argv: ['--list', '--stale-days', '5'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'list' },
          staleDays: 5,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });
  });

  describe('day counts', () => {
    test('accepts the lowest and the highest day count', () => {
      expect(parseArguments({ argv: ['--stale-days', '1', '--unused-days', '36500'] })).toEqual({
        kind: 'succeeded',
        value: { mode: { kind: 'interactive' }, staleDays: 1, unusedDays: 36_500 },
      });
    });

    test.each(['0', '36501', '1.5', '+5', '1e3', 'ten', ''])(
      'rejects the day count "%s" as not a number in range',
      (text) => {
        expect(parseArguments({ argv: ['--stale-days', text] })).toEqual({
          kind: 'failed',
          failure: { reason: 'invalidNumber', detail: text },
        });
      },
    );

    test('rejects an out-of-range --unused-days value with the value as detail', () => {
      expect(parseArguments({ argv: ['--unused-days', '0'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'invalidNumber', detail: '0' },
      });
    });
  });

  describe('option values', () => {
    test('a value option at the end of the arguments is a missing value', () => {
      expect(parseArguments({ argv: ['--select'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'missingValue', detail: '--select' },
      });
    });

    test('a value option followed by another option is a missing value', () => {
      expect(parseArguments({ argv: ['--stale-days', '--list'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'missingValue', detail: '--stale-days' },
      });
    });

    test('a negative day count is a missing value, because it starts with a dash', () => {
      expect(parseArguments({ argv: ['--unused-days', '-5'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'missingValue', detail: '--unused-days' },
      });
    });

    test('a selection that starts with a dash is a missing value', () => {
      expect(parseArguments({ argv: ['--dry-run', '--select', '-1'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'missingValue', detail: '--select' },
      });
    });

    test('the next argument is the selection even when it has spaces and commas', () => {
      expect(parseArguments({ argv: ['--dry-run', '--select', '1, 3 safe'] })).toEqual({
        kind: 'succeeded',
        value: {
          mode: { kind: 'dryRun', selectionSpec: '1, 3 safe' },
          staleDays: SCAN_LIMITS.defaultStaleDays,
          unusedDays: SCAN_LIMITS.defaultUnusedDays,
        },
      });
    });
  });

  describe('unknown arguments', () => {
    test('an unknown option is reported as it was typed', () => {
      expect(parseArguments({ argv: ['--frobnicate'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownOption', detail: '--frobnicate' },
      });
    });

    test('--name=value is not supported', () => {
      expect(parseArguments({ argv: ['--select=1'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownOption', detail: '--select=1' },
      });
    });

    test('a short option other than -h is an unknown option', () => {
      expect(parseArguments({ argv: ['-x'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownOption', detail: '-x' },
      });
    });

    test('a bare word is an unexpected argument', () => {
      expect(parseArguments({ argv: ['clean'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unexpectedArgument', detail: 'clean' },
      });
    });

    test('a second word after a selection is an unexpected argument', () => {
      expect(parseArguments({ argv: ['--dry-run', '--select', '1', '3'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unexpectedArgument', detail: '3' },
      });
    });
  });

  describe('conflicting options', () => {
    test('the same option twice conflicts', () => {
      expect(parseArguments({ argv: ['--list', '--list'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--list' },
      });
    });

    test('the same day count option twice conflicts', () => {
      expect(parseArguments({ argv: ['--stale-days', '5', '--stale-days', '6'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--stale-days' },
      });
    });

    test('-h and --help are the same option', () => {
      expect(parseArguments({ argv: ['-h', '--help'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--help' },
      });
    });

    test('--list with --dry-run conflicts', () => {
      expect(parseArguments({ argv: ['--list', '--dry-run'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--list and --dry-run' },
      });
    });

    test('--help with another option conflicts', () => {
      expect(parseArguments({ argv: ['--help', '--list'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--help and --list' },
      });
    });

    test('--help with a day count conflicts', () => {
      expect(parseArguments({ argv: ['--stale-days', '5', '--help'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--help and --stale-days' },
      });
    });
  });

  describe('selection without dry run', () => {
    test('--select alone needs --dry-run', () => {
      expect(parseArguments({ argv: ['--select', '1'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'selectNeedsDryRun', detail: '--select' },
      });
    });

    test('--select with --list needs --dry-run', () => {
      expect(parseArguments({ argv: ['--list', '--select', '1'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'selectNeedsDryRun', detail: '--select' },
      });
    });
  });

  describe('check order', () => {
    test('a value option followed by an option reports the missing value first', () => {
      expect(parseArguments({ argv: ['--select', '--frobnicate'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'missingValue', detail: '--select' },
      });
    });

    test('an argument failure comes before a conflict', () => {
      expect(parseArguments({ argv: ['--frobnicate', '--list', '--list'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'unknownOption', detail: '--frobnicate' },
      });
    });

    test('an invalid number comes before a conflict', () => {
      expect(parseArguments({ argv: ['--list', '--list', '--stale-days', '0'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'invalidNumber', detail: '0' },
      });
    });

    test('a conflict comes before the selection rule', () => {
      expect(parseArguments({ argv: ['--select', '1', '--list', '--list'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--list' },
      });
    });

    test('help with --select reports the conflict, not the missing dry run', () => {
      expect(parseArguments({ argv: ['--help', '--select', '1'] })).toEqual({
        kind: 'failed',
        failure: { reason: 'conflictingOptions', detail: '--help and --select' },
      });
    });
  });
});
