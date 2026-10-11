import type { Risk } from '../catalog/catalog.js';
import type { Result } from '../result.js';

export type SelectionChoice = {
  number: number;
  risk: Risk;
};

export type SelectionFailure = {
  reason: 'unknownToken' | 'outOfRange' | 'reversedRange' | 'noneMixed';
  token: string;
};

type NumberRange = {
  startNumber: number;
  endNumber: number;
};

const digitsOnlyPattern = /^[0-9]+$/;

export function parseSelection(params: {
  input: string;
  choices: SelectionChoice[];
}): Result<number[], SelectionFailure> {
  const tokens = params.input.split(/[\s,]+/).filter((token) => token !== '');

  return collectSelectedNumbers({ tokens: tokens, choices: params.choices });
}

function collectSelectedNumbers(params: {
  tokens: string[];
  choices: SelectionChoice[];
}): Result<number[], SelectionFailure> {
  const selectedNumbers = new Set<number>();

  for (const token of params.tokens) {
    const tokenResult = parseSelectionToken({
      token: token,
      tokenCount: params.tokens.length,
      choices: params.choices,
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
  choices: SelectionChoice[];
}): Result<number[], SelectionFailure> {
  const lowerCaseToken = params.token.toLowerCase();

  if (lowerCaseToken === 'none') {
    if (params.tokenCount === 1) {
      return { kind: 'succeeded', value: [] };
    }

    return { kind: 'failed', failure: { reason: 'noneMixed', token: params.token } };
  }

  if (lowerCaseToken === 'safe') {
    const safeNumbers = params.choices
      .filter((choice) => choice.risk === 'safe')
      .map((choice) => choice.number);

    return { kind: 'succeeded', value: safeNumbers };
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
    choices: params.choices,
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
  choices: SelectionChoice[];
}): Result<number[], SelectionFailure> {
  const rangeNumbers: number[] = [];

  for (
    let choiceNumber = params.numberRange.startNumber;
    choiceNumber <= params.numberRange.endNumber;
    choiceNumber += 1
  ) {
    if (!params.choices.some((choice) => choice.number === choiceNumber)) {
      return { kind: 'failed', failure: { reason: 'outOfRange', token: params.token } };
    }

    rangeNumbers.push(choiceNumber);
  }

  return { kind: 'succeeded', value: rangeNumbers };
}
