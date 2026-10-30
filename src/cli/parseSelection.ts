import type { Result } from '../result.js';

export type SelectionFailure = {
  reason: 'unknownToken' | 'outOfRange' | 'reversedRange' | 'noneMixed';
  token: string;
};

type NumberRange = {
  startNumber: number;
  endNumber: number;
};

const digitsOnlyPattern = /^[0-9]+$/;

/** `choiceCount` numbers the items 1 to it; `safe` picks `safeNumbers`, which the report decides. */
export function parseSelection(params: {
  input: string;
  choiceCount: number;
  safeNumbers: number[];
}): Result<number[], SelectionFailure> {
  const tokens = params.input.split(/[\s,]+/).filter((token) => token !== '');

  return collectSelectedNumbers({
    tokens: tokens,
    choiceCount: params.choiceCount,
    safeNumbers: params.safeNumbers,
  });
}

function collectSelectedNumbers(params: {
  tokens: string[];
  choiceCount: number;
  safeNumbers: number[];
}): Result<number[], SelectionFailure> {
  const selectedNumbers = new Set<number>();

  for (const token of params.tokens) {
    const tokenResult = parseSelectionToken({
      token: token,
      tokenCount: params.tokens.length,
      choiceCount: params.choiceCount,
      safeNumbers: params.safeNumbers,
    });

    if (tokenResult.kind === 'failed') {
      return tokenResult;
    }

    for (const choiceNumber of tokenResult.value) {
      selectedNumbers.add(choiceNumber);
    }
  }

  return {
    kind: 'succeeded',
    value: [...selectedNumbers].toSorted((left, right) => left - right),
  };
}

function parseSelectionToken(params: {
  token: string;
  tokenCount: number;
  choiceCount: number;
  safeNumbers: number[];
}): Result<number[], SelectionFailure> {
  const lowerCaseToken = params.token.toLowerCase();

  if (lowerCaseToken === 'none') {
    if (params.tokenCount === 1) {
      return { kind: 'succeeded', value: [] };
    }

    return { kind: 'failed', failure: { reason: 'noneMixed', token: params.token } };
  }

  if (lowerCaseToken === 'safe') {
    return { kind: 'succeeded', value: params.safeNumbers };
  }

  const numberRange = parseNumberRange({ token: params.token });

  if (numberRange === null) {
    return { kind: 'failed', failure: { reason: 'unknownToken', token: params.token } };
  }

  if (numberRange.startNumber > numberRange.endNumber) {
    return { kind: 'failed', failure: { reason: 'reversedRange', token: params.token } };
  }

  return selectNumberRange({
    token: params.token,
    numberRange: numberRange,
    choiceCount: params.choiceCount,
  });
}

/** `null` when the token is neither digits nor `A-B` with digits on both sides. */
function parseNumberRange(params: { token: string }): NumberRange | null {
  if (digitsOnlyPattern.test(params.token)) {
    const choiceNumber = Number(params.token);

    return { startNumber: choiceNumber, endNumber: choiceNumber };
  }

  const separatorIndex = params.token.indexOf('-');

  if (separatorIndex === -1) {
    return null;
  }

  const startText = params.token.slice(0, separatorIndex);
  const endText = params.token.slice(separatorIndex + 1);

  if (!digitsOnlyPattern.test(startText) || !digitsOnlyPattern.test(endText)) {
    return null;
  }

  return { startNumber: Number(startText), endNumber: Number(endText) };
}

function selectNumberRange(params: {
  token: string;
  numberRange: NumberRange;
  choiceCount: number;
}): Result<number[], SelectionFailure> {
  const rangeNumbers: number[] = [];

  for (
    let choiceNumber = params.numberRange.startNumber;
    choiceNumber <= params.numberRange.endNumber;
    choiceNumber += 1
  ) {
    if (choiceNumber < 1 || choiceNumber > params.choiceCount) {
      return { kind: 'failed', failure: { reason: 'outOfRange', token: params.token } };
    }

    rangeNumbers.push(choiceNumber);
  }

  return { kind: 'succeeded', value: rangeNumbers };
}
