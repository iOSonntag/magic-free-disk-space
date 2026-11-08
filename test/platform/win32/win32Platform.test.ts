import { describe, expect, test } from 'bun:test';
import { win32Platform } from '../../../src/platform/win32/win32Platform.js';

describe('win32Platform', () => {
  test('ends a run on SIGINT and SIGTERM alone, since Windows has neither SIGHUP nor SIGQUIT', () => {
    expect(win32Platform.tools.processEndSignals.map((processEnd) => processEnd.signal)).toEqual([
      'SIGINT',
      'SIGTERM',
    ]);
  });
});
