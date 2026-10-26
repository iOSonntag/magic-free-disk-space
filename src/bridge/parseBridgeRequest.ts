import type { Result } from '../result.js';

export type BridgeRequestScan = { kind: 'scan' };

export type BridgeRequestPlan = { kind: 'plan'; numbers: number[] };

export type BridgeRequestDelete = { kind: 'delete'; planId: number; confirmation: string };

export type BridgeRequest = BridgeRequestScan | BridgeRequestPlan | BridgeRequestDelete;

export type BridgeRequestFailure = { reason: 'invalidJson' | 'unknownRequest' };

/** Parses one line the app sent; any shape but the three requests fails. */
export function parseBridgeRequest(params: {
  line: string;
}): Result<BridgeRequest, BridgeRequestFailure> {
  const parsedJson = parseJson({ text: params.line });

  if (parsedJson.kind === 'failed') {
    return parsedJson;
  }

  const request = toBridgeRequest({ value: parsedJson.value });

  if (request === null) {
    return { kind: 'failed', failure: { reason: 'unknownRequest' } };
  }

  return { kind: 'succeeded', value: request };
}

function parseJson(params: { text: string }): Result<unknown, BridgeRequestFailure> {
  try {
    return { kind: 'succeeded', value: JSON.parse(params.text) };
  } catch {
    return { kind: 'failed', failure: { reason: 'invalidJson' } };
  }
}

/** `null` when the value is none of the requests. */
function toBridgeRequest(params: { value: unknown }): BridgeRequest | null {
  if (typeof params.value !== 'object' || params.value === null) {
    return null;
  }

  const fields: Record<string, unknown> = { ...params.value };

  if (fields.kind === 'scan') {
    return { kind: 'scan' };
  }

  if (fields.kind === 'plan' && isIntegerArray(fields.numbers)) {
    return { kind: 'plan', numbers: fields.numbers };
  }

  if (
    fields.kind === 'delete' &&
    typeof fields.planId === 'number' &&
    Number.isSafeInteger(fields.planId) &&
    typeof fields.confirmation === 'string'
  ) {
    return { kind: 'delete', planId: fields.planId, confirmation: fields.confirmation };
  }

  return null;
}

function isIntegerArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((element) => typeof element === 'number' && Number.isSafeInteger(element))
  );
}
