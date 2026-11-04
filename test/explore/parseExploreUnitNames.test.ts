import { describe, expect, test } from 'bun:test';
import { parseAndroidAvdName } from '../../src/explore/android/parseAndroidAvdName.js';
import { parseHomebrewFormulaName } from '../../src/explore/homebrew/parseHomebrewFormulaName.js';
import { parseSimulatorRuntimeId } from '../../src/explore/simulatorRuntimes/parseSimulatorRuntimeId.js';
import {
  buildTestAndroidAvdName,
  buildTestHomebrewFormulaName,
  buildTestSimulatorRuntimeId,
} from '../support/parsedValueFixtures.js';

const RUNTIME_ID_TEXT = '6E8D3F4A-2B1C-4D5E-9F80-1A2B3C4D5E6F';

describe('parseSimulatorRuntimeId', () => {
  test('passes the UUID simctl prints for a runtime', () => {
    expect(parseSimulatorRuntimeId({ text: RUNTIME_ID_TEXT })).toEqual({
      kind: 'succeeded',
      value: buildTestSimulatorRuntimeId({ text: RUNTIME_ID_TEXT }),
    });
  });

  test('rejects any text but a UUID, an option among them', () => {
    for (const text of ['--all', '', 'com.apple.CoreSimulator.SimRuntime.iOS-18-2', 'not-a-uuid']) {
      expect(parseSimulatorRuntimeId({ text: text }).kind).toBe('failed');
    }
  });
});

describe('parseAndroidAvdName', () => {
  test('passes the names avdmanager allows', () => {
    for (const text of ['Pixel_8_API_35', 'test.avd-2']) {
      expect(parseAndroidAvdName({ text: text })).toEqual({
        kind: 'succeeded',
        value: buildTestAndroidAvdName({ text: text }),
      });
    }
  });

  test('rejects a name that could start an option, is empty, or holds a path', () => {
    for (const text of ['-n', '', '../Pixel', 'Pixel 8', `Pixel${String.fromCodePoint(0x2028)}`]) {
      expect(parseAndroidAvdName({ text: text }).kind).toBe('failed');
    }
  });
});

describe('parseHomebrewFormulaName', () => {
  test('passes the names Homebrew prints, versioned and with a plus', () => {
    for (const text of ['wget', 'python@3.12', 'libxml++', 'node_exporter']) {
      expect(parseHomebrewFormulaName({ text: text })).toEqual({
        kind: 'succeeded',
        value: buildTestHomebrewFormulaName({ text: text }),
      });
    }
  });

  test('rejects a name that could start an option, is empty, or holds a path', () => {
    for (const text of ['--force', '', 'homebrew/core/wget', 'two words']) {
      expect(parseHomebrewFormulaName({ text: text }).kind).toBe('failed');
    }
  });
});
