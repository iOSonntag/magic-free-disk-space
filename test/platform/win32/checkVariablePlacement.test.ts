import { describe, expect, test } from 'bun:test';
import { WIN32_PATH_RULES } from '../../../src/path/pathRules.js';
import type {
  VariableCheck,
  VariableReading,
} from '../../../src/platform/win32/checkVariablePlacement.js';
import { checkVariablePlacement } from '../../../src/platform/win32/checkVariablePlacement.js';
import { buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

const tempPath = buildTestWindowsPath({ text: 'C:\\Users\\tester\\AppData\\Local\\Temp' });

function buildTempCheck(params: { variableName: string; reading: VariableReading }): VariableCheck {
  return {
    variableName: params.variableName,
    reading: params.reading,
    expectedFolder: { path: tempPath, realPath: tempPath },
  };
}

/** A TEMP check whose expected folder is a link Windows names at `tempPath` to `D:\Scratch`. */
function buildLinkedTempCheck(params: { readingText: string }): VariableCheck {
  return {
    variableName: 'TEMP',
    reading: buildResolvedReading({ text: params.readingText }),
    expectedFolder: { path: tempPath, realPath: buildTestWindowsPath({ text: 'D:\\Scratch' }) },
  };
}

function buildResolvedReading(params: { text: string }): VariableReading {
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
            reading: buildResolvedReading({ text: 'c:\\users\\TESTER\\appdata\\local\\temp' }),
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
          buildTempCheck({
            variableName: 'TMP',
            reading: buildResolvedReading({ text: 'D:\\Scratch' }),
          }),
          buildTempCheck({ variableName: 'TEMP', reading: { kind: 'unresolvable' } }),
        ],
      }),
    ).toEqual({ reason: 'variableElsewhere', variableName: 'TMP', path: tempPath });
  });

  test('refuses a folder inside the expected one and one that holds it', () => {
    for (const text of [
      'C:\\Users\\tester\\AppData\\Local\\Temp\\sub',
      'C:\\Users\\tester\\AppData\\Local',
    ]) {
      expect(
        checkVariablePlacement({
          pathRules: WIN32_PATH_RULES,
          checks: [
            buildTempCheck({ variableName: 'TEMP', reading: buildResolvedReading({ text: text }) }),
          ],
        }),
      ).toEqual({ reason: 'variableElsewhere', variableName: 'TEMP', path: tempPath });
    }
  });

  test('compares the real path of the expected folder and names the path Windows gives it', () => {
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [buildLinkedTempCheck({ readingText: 'd:\\scratch' })],
      }),
    ).toBeNull();
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [buildLinkedTempCheck({ readingText: tempPath })],
      }),
    ).toEqual({ reason: 'variableElsewhere', variableName: 'TEMP', path: tempPath });
  });

  test('refuses a variable whose folder does not resolve', () => {
    expect(
      checkVariablePlacement({
        pathRules: WIN32_PATH_RULES,
        checks: [buildTempCheck({ variableName: 'TEMP', reading: { kind: 'unresolvable' } })],
      }),
    ).toEqual({ reason: 'variableElsewhere', variableName: 'TEMP', path: tempPath });
  });
});
