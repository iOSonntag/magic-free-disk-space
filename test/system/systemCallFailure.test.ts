import { describe, expect, test } from 'bun:test';
import {
  formatSystemCallCode,
  formatSystemCallFailure,
} from '../../src/system/systemCallFailure.js';

describe('formatSystemCallCode', () => {
  test('writes an HRESULT and an error code as eight upper-case hex digits', () => {
    expect(formatSystemCallCode({ code: 0x8007_0005 })).toBe('0x80070005');
    expect(formatSystemCallCode({ code: 0xe })).toBe('0x0000000E');
    expect(formatSystemCallCode({ code: 0 })).toBe('0x00000000');
  });

  test('writes a negative HRESULT, as a signed call returns it, as its 32 bits', () => {
    expect(formatSystemCallCode({ code: -2_147_024_891 })).toBe('0x80070005');
  });
});

describe('formatSystemCallFailure', () => {
  test('names the call and its code', () => {
    expect(
      formatSystemCallFailure({ failure: { call: 'SHEmptyRecycleBinW', code: 0x8007_0005 } }),
    ).toBe('SHEmptyRecycleBinW failed with 0x80070005');
    expect(
      formatSystemCallFailure({ failure: { call: 'AssignProcessToJobObject', code: 5 } }),
    ).toBe('AssignProcessToJobObject failed with 0x00000005');
  });
});
