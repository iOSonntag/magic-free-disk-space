import type { Result } from '../result.js';
import { SCAN_LIMITS } from '../scan/limits.js';

export type CliModeInteractive = { kind: 'interactive' };

export type CliModeList = { kind: 'list' };

export type CliModeDryRun = { kind: 'dryRun'; selectionSpec: string | null };

export type CliModeHelp = { kind: 'help' };

export type CliMode = CliModeInteractive | CliModeList | CliModeDryRun | CliModeHelp;

export type CliArguments = {
  mode: CliMode;
  staleDays: number;
  unusedDays: number;
};

export type ArgumentFailure = {
  reason:
    | 'unknownOption'
    | 'unexpectedArgument'
    | 'missingValue'
    | 'invalidNumber'
    | 'conflictingOptions'
    | 'selectNeedsDryRun';
  detail: string;
};

type CliOptionName = 'list' | 'dryRun' | 'help' | 'select' | 'staleDays' | 'unusedDays';

type ScannedArguments = {
  optionNames: CliOptionName[];
  selectionSpec: string | null;
  staleDays: number | null;
  unusedDays: number | null;
};

const optionFlagTexts: Record<CliOptionName, string> = {
  list: '--list',
  dryRun: '--dry-run',
  help: '--help',
  select: '--select',
  staleDays: '--stale-days',
  unusedDays: '--unused-days',
};

const digitsOnlyPattern = /^[0-9]+$/;

const minimumDayCount = 1;

const maximumDayCount = 36_500;

export function parseArguments(params: { argv: string[] }): Result<CliArguments, ArgumentFailure> {
  const scanResult = scanArguments({ argv: params.argv });

  if (scanResult.kind === 'failed') {
    return scanResult;
  }

  const combinationResult = validateOptionCombination({
    optionNames: scanResult.value.optionNames,
  });

  if (combinationResult.kind === 'failed') {
    return combinationResult;
  }

  return {
    kind: 'succeeded',
    value: {
      mode: buildCliMode({
        optionNames: scanResult.value.optionNames,
        selectionSpec: scanResult.value.selectionSpec,
      }),
      staleDays: scanResult.value.staleDays ?? SCAN_LIMITS.defaultStaleDays,
      unusedDays: scanResult.value.unusedDays ?? SCAN_LIMITS.defaultUnusedDays,
    },
  };
}

function scanArguments(params: { argv: string[] }): Result<ScannedArguments, ArgumentFailure> {
  const optionNames: CliOptionName[] = [];
  let selectionSpec: string | null = null;
  let staleDays: number | null = null;
  let unusedDays: number | null = null;
  const argumentIterator = params.argv.values();

  for (const argument of argumentIterator) {
    switch (argument) {
      case '--list':
        optionNames.push('list');
        break;

      case '--dry-run':
        optionNames.push('dryRun');
        break;

      case '--help':
      case '-h':
        optionNames.push('help');
        break;

      case '--select': {
        const valueResult = takeOptionValue({
          option: argument,
          argumentIterator: argumentIterator,
        });

        if (valueResult.kind === 'failed') {
          return valueResult;
        }

        optionNames.push('select');
        selectionSpec = valueResult.value;
        break;
      }

      case '--stale-days': {
        const dayCountResult = takeDayCount({
          option: argument,
          argumentIterator: argumentIterator,
        });

        if (dayCountResult.kind === 'failed') {
          return dayCountResult;
        }

        optionNames.push('staleDays');
        staleDays = dayCountResult.value;
        break;
      }

      case '--unused-days': {
        const dayCountResult = takeDayCount({
          option: argument,
          argumentIterator: argumentIterator,
        });

        if (dayCountResult.kind === 'failed') {
          return dayCountResult;
        }

        optionNames.push('unusedDays');
        unusedDays = dayCountResult.value;
        break;
      }

      default:
        if (argument.startsWith('-')) {
          return { kind: 'failed', failure: { reason: 'unknownOption', detail: argument } };
        }

        return { kind: 'failed', failure: { reason: 'unexpectedArgument', detail: argument } };
    }
  }

  return {
    kind: 'succeeded',
    value: {
      optionNames: optionNames,
      selectionSpec: selectionSpec,
      staleDays: staleDays,
      unusedDays: unusedDays,
    },
  };
}

function takeOptionValue(params: {
  option: string;
  argumentIterator: Iterator<string>;
}): Result<string, ArgumentFailure> {
  const nextArgument = params.argumentIterator.next();

  if (nextArgument.done === true || nextArgument.value.startsWith('-')) {
    return { kind: 'failed', failure: { reason: 'missingValue', detail: params.option } };
  }

  return { kind: 'succeeded', value: nextArgument.value };
}

function takeDayCount(params: {
  option: string;
  argumentIterator: Iterator<string>;
}): Result<number, ArgumentFailure> {
  const valueResult = takeOptionValue({
    option: params.option,
    argumentIterator: params.argumentIterator,
  });

  if (valueResult.kind === 'failed') {
    return valueResult;
  }

  const dayCount = parseDayCount({ text: valueResult.value });

  if (dayCount === null) {
    return { kind: 'failed', failure: { reason: 'invalidNumber', detail: valueResult.value } };
  }

  return { kind: 'succeeded', value: dayCount };
}

/** `null` when the text is not a whole number within the day count limits. */
function parseDayCount(params: { text: string }): number | null {
  if (!digitsOnlyPattern.test(params.text)) {
    return null;
  }

  const dayCount = Number(params.text);

  if (dayCount < minimumDayCount || dayCount > maximumDayCount) {
    return null;
  }

  return dayCount;
}

function validateOptionCombination(params: {
  optionNames: CliOptionName[];
}): Result<null, ArgumentFailure> {
  const repeatedOptionName = findRepeatedOptionName({ optionNames: params.optionNames });

  if (repeatedOptionName !== null) {
    return {
      kind: 'failed',
      failure: { reason: 'conflictingOptions', detail: optionFlagTexts[repeatedOptionName] },
    };
  }

  if (params.optionNames.includes('list') && params.optionNames.includes('dryRun')) {
    return {
      kind: 'failed',
      failure: {
        reason: 'conflictingOptions',
        detail: `${optionFlagTexts.list} and ${optionFlagTexts.dryRun}`,
      },
    };
  }

  const otherOptionName = params.optionNames.find((optionName) => optionName !== 'help') ?? null;

  if (params.optionNames.includes('help') && otherOptionName !== null) {
    return {
      kind: 'failed',
      failure: {
        reason: 'conflictingOptions',
        detail: `${optionFlagTexts.help} and ${optionFlagTexts[otherOptionName]}`,
      },
    };
  }

  if (params.optionNames.includes('select') && !params.optionNames.includes('dryRun')) {
    return {
      kind: 'failed',
      failure: { reason: 'selectNeedsDryRun', detail: optionFlagTexts.select },
    };
  }

  return { kind: 'succeeded', value: null };
}

function findRepeatedOptionName(params: { optionNames: CliOptionName[] }): CliOptionName | null {
  const seenOptionNames = new Set<CliOptionName>();

  for (const optionName of params.optionNames) {
    if (seenOptionNames.has(optionName)) {
      return optionName;
    }

    seenOptionNames.add(optionName);
  }

  return null;
}

function buildCliMode(params: {
  optionNames: CliOptionName[];
  selectionSpec: string | null;
}): CliMode {
  if (params.optionNames.includes('help')) {
    return { kind: 'help' };
  }

  if (params.optionNames.includes('list')) {
    return { kind: 'list' };
  }

  if (params.optionNames.includes('dryRun')) {
    return { kind: 'dryRun', selectionSpec: params.selectionSpec };
  }

  return { kind: 'interactive' };
}
