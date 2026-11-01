import { describe, expect, test } from 'bun:test';
import { formatPreferencesSaveFailure } from '../../src/report/formatPreferencesSaveFailure.js';

describe('formatPreferencesSaveFailure', () => {
  test('names what failed and its error code for each reason', () => {
    expect(
      formatPreferencesSaveFailure({ failure: { reason: 'directoryUnavailable', code: 'EACCES' } }),
    ).toBe('Cannot create the support folder of the app (EACCES), so the setting stays as it was.');
    expect(
      formatPreferencesSaveFailure({ failure: { reason: 'writeFailed', code: 'ENOSPC' } }),
    ).toBe(
      'Cannot write the setting file in the support folder of the app (ENOSPC), so the setting stays as it was.',
    );
  });
});
