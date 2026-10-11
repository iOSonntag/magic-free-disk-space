import { describe, expect, test } from 'bun:test';
import { isDeleteConfirmation } from '../../src/cli/confirmation.js';

describe('isDeleteConfirmation', () => {
  test('accepts the confirmation word', () => {
    expect(isDeleteConfirmation({ line: 'DELETE' })).toBe(true);
  });

  test('ignores the whitespace around the word, including a carriage return', () => {
    expect(isDeleteConfirmation({ line: '  DELETE \r' })).toBe(true);
  });

  test('is case-sensitive', () => {
    expect(isDeleteConfirmation({ line: 'delete' })).toBe(false);
  });

  test('rejects any other text', () => {
    expect(isDeleteConfirmation({ line: 'DELETE it' })).toBe(false);
    expect(isDeleteConfirmation({ line: 'DELETED' })).toBe(false);
    expect(isDeleteConfirmation({ line: '' })).toBe(false);
  });
});
