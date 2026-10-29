import { describe, expect, test } from 'bun:test';
import { isDeleteConfirmation } from '../../src/delete/confirmation.js';

describe('isDeleteConfirmation', () => {
  test('accepts the confirmation word', () => {
    expect(isDeleteConfirmation({ confirmation: 'DELETE' })).toBe(true);
  });

  test('ignores the whitespace around the word, including a carriage return', () => {
    expect(isDeleteConfirmation({ confirmation: '  DELETE \r' })).toBe(true);
  });

  test('is case-sensitive', () => {
    expect(isDeleteConfirmation({ confirmation: 'delete' })).toBe(false);
  });

  test('rejects any other text', () => {
    expect(isDeleteConfirmation({ confirmation: 'DELETE it' })).toBe(false);
    expect(isDeleteConfirmation({ confirmation: 'DELETED' })).toBe(false);
    expect(isDeleteConfirmation({ confirmation: '' })).toBe(false);
  });
});
