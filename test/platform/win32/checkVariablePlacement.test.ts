import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../../src/path/pathRules.js';
import type {
  VariableCheck,
  VariableReading,
} from '../../../src/platform/win32/checkVariablePlacement.js';
import { checkVariablePlacement } from '../../../src/platform/win32/checkVariablePlacement.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

const TEMP_PATH = buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local\\Temp' });

function buildTempCheck(params: { variableName: string; reading: VariableReading }): VariableCheck {
  return {
    variableName: params.variableName,
    reading: params.reading,
    expectedPath: TEMP_PATH,
    expectedRealPath: TEMP_PATH,
  };
}

function resolvedTo(params: { text: string }): VariableReading {
  return { kind: 'resolved', realPath: buildTestWindowsPath({ text: params.text }) };
}

describe('checkVariablePlacement', () => {
  test('passes an unset variable and one that names the expected folder in another case', () => {
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [
          buildTempCheck({ variableName: 'TMP', reading: { kind: 'unset' } }),
          buildTempCheck({
            variableName: 'TEMP',
            reading: resolvedTo({ text: 'c:\\users\\TESTER\\appdata\\local\\temp' }),
          }),
        ],
      }),
    ).toBeNull();
  });

  test('refuses the first variable that names another folder, naming it and the expected one', () => {
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [
          buildTempCheck({ variableName: 'TMP', reading: resolvedTo({ text: 'D:\\Scratch' }) }),
          buildTempCheck({ variableName: 'TEMP', reading: { kind: 'unresolvable' } }),
        ],
      }),
    ).toEqual({ reason: 'variableElsewhere', variableName: 'TMP', path: TEMP_PATH });
  });

  test('refuses a folder inside the expected one and one that holds it', () => {
    for (const text of [
      'C:\\Users\\tester\\AppData\\Local\\Temp\\sub',
      'C:\\Users\\tester\\AppData\\Local',
    ]) {
      expect(
        checkVariablePlacement({
          pathRules: WIN32_PATH_RULES,
          checks: [buildTempCheck({ variableName: 'TEMP', reading: resolvedTo({ text: text }) })],
        }),
      ).toEqual({ reason: 'variableElsewhere', variableName: 'TEMP', path: TEMP_PATH });
    }
  });

  test('refuses a variable whose folder does not resolve', () => {
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [buildTempCheck({ variableName: 'TEMP', reading: { kind: 'unresolvable' } })],
      }),
    ).toEqual({ reason: 'variableElsewhere', variableName: 'TEMP', path: TEMP_PATH });
  });
});
