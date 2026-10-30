import type { Result } from '../result.js';

export function parseJsonValue(params: { text: string }): Result<unknown, string> {
  try {
    const value: unknown = JSON.parse(params.text);

    return { kind: 'succeeded', value: value };
  } catch {
    return { kind: 'failed', failure: 'no JSON' };
  }
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
